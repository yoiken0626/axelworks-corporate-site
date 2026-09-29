// 既存記事すべてに対して、未翻訳の言語（対応言語をレジストリに追加した直後など）を
// 追加で翻訳するための、ローカル実行専用のバックフィルスクリプト。
//
// 使い方（npm scripts、詳細はREADME参照）:
//   npm run translate:backfill          # 確認モード（書き込みなし）。対象記事と未翻訳言語の一覧を表示する
//   npm run translate:backfill -- --write  # 実行モード。記事を1本ずつ順番に翻訳・書き込み・検証する
//   npm run translate:backfill -- --write --id=<contentId>  # 指定した記事（1件以上、カンマ区切り）だけに限定する
//
// 実行には .env.local（または .env）に以下が必要:
//   MICROCMS_SERVICE_DOMAIN / MICROCMS_API_KEY / MICROCMS_MANAGEMENT_API_KEY / ANTHROPIC_API_KEY
//
// 実行モードの安全性:
// - 既存の翻訳は上書きしない（missingTranslationLangs で未翻訳の言語だけを対象にする）
// - 記事ごとに、書き込み後に読み直して検証する（app/_libs/translate-pipeline.ts と同じ実装を共有）
// - 途中で失敗しても、再実行すれば残りの記事・言語だけが処理される（完了済みはスキップされる）
// - 現在「生成中」でロック中（かつ滞留していない）の記事はスキップする
//   （/api/translate-article のWebhookと同時に走っても競合しにくくする）
// - 記事と記事の間に間隔を空け、Anthropic APIのレート制限に配慮する

import { createClient } from 'microcms-js-sdk';
import type { MicroCMSListContent } from 'microcms-js-sdk';
import type { News } from '../app/_libs/news';
import { missingTranslationLangs } from '../app/_libs/news';
import { isStaleGenerating, translatePendingLanguages } from '../app/_libs/translate-pipeline';

// .env.local を優先し、.env で不足分を補う（Next.jsの読み込み順序に合わせる）。
// process.loadEnvFile は既に process.env にある変数を上書きしないため、この順序が重要。
for (const file of ['.env.local', '.env']) {
  try {
    process.loadEnvFile(file);
  } catch {
    // ファイルが無い場合はスキップ（本番のCI環境変数等で足りている想定もあるため）
  }
}

const REQUIRED_ENV = [
  'MICROCMS_SERVICE_DOMAIN',
  'MICROCMS_API_KEY',
  'MICROCMS_MANAGEMENT_API_KEY',
  'ANTHROPIC_API_KEY',
] as const;

const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missingEnv.length > 0) {
  console.error(`[translate-backfill] 必要な環境変数が未設定です: ${missingEnv.join(', ')}`);
  process.exit(1);
}

const WRITE_MODE = process.argv.includes('--write');
// 記事間の待機時間。Anthropic APIのレート制限に配慮するための間隔（ミリ秒）。
const INTERVAL_MS = Number(process.env.TRANSLATE_BACKFILL_INTERVAL_MS) || 5000;
// --id=<contentId>[,<contentId>...] が指定された場合、対象をその記事だけに絞る
// （本番と共有のmicroCMSに対して、まず1記事だけで動作確認したい場合に使う）。
const idArg = process.argv.find((arg) => arg.startsWith('--id='));
const ONLY_IDS: Set<string> | null = idArg
  ? new Set(
      idArg
        .slice('--id='.length)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    )
  : null;

const readClient = createClient({
  serviceDomain: process.env.MICROCMS_SERVICE_DOMAIN!,
  apiKey: process.env.MICROCMS_API_KEY!,
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type NewsWithId = News & MicroCMSListContent;

// getAllContents はページングを内部で処理し、全件を1つの配列で返す
const fetchAllArticles = (): Promise<NewsWithId[]> =>
  readClient.getAllContents<News>({ endpoint: 'news' }) as Promise<NewsWithId[]>;

async function main() {
  console.log(`[translate-backfill] mode: ${WRITE_MODE ? '実行（書き込みあり）' : '確認（書き込みなし）'}`);

  const articles = await fetchAllArticles();
  console.log(`[translate-backfill] microCMSのnews記事: 全${articles.length}件`);

  let targets = articles
    .map((article) => ({ article, missing: missingTranslationLangs(article) }))
    .filter(({ missing }) => missing.length > 0);

  if (ONLY_IDS) {
    targets = targets.filter(({ article }) => ONLY_IDS.has(article.id));
    console.log(`[translate-backfill] --id指定により対象を絞り込み: ${Array.from(ONLY_IDS).join(', ')}`);
  }

  if (targets.length === 0) {
    console.log('[translate-backfill] 未翻訳の言語がある記事はありません。');
    return;
  }

  console.log(`[translate-backfill] 未翻訳の言語がある記事: ${targets.length}件\n`);

  for (const { article, missing } of targets) {
    const locked = article.translation_status?.includes('生成中') && !isStaleGenerating(article);
    const lockNote = locked ? '（生成中でロック中のためスキップ対象）' : '';
    console.log(
      `- [${article.id}] ${article.title}\n` +
        `    未翻訳: ${missing.join(', ')}\n` +
        `    translation_status: ${article.translation_status?.join(',') ?? '(未設定)'} ${lockNote}`,
    );
  }

  if (!WRITE_MODE) {
    console.log(
      `\n[translate-backfill] 確認モードのため書き込みは行っていません。実行するには --write を付けてください。`,
    );
    return;
  }

  console.log(`\n[translate-backfill] 実行モード開始（記事間隔: ${INTERVAL_MS}ms）\n`);

  let okCount = 0;
  let partialCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (let index = 0; index < targets.length; index += 1) {
    const { article } = targets[index];
    const contentId = article.id;

    if (article.translation_status?.includes('生成中') && !isStaleGenerating(article)) {
      console.log(`[${index + 1}/${targets.length}] ${contentId}: 生成中でロック中のためスキップ`);
      skippedCount++;
      continue;
    }

    console.log(`[${index + 1}/${targets.length}] ${contentId}: 翻訳開始`);
    try {
      const outcome = await translatePendingLanguages(contentId, article, () =>
        readClient.getListDetail<News>({ endpoint: 'news', contentId }),
      );
      switch (outcome.status) {
        case 'skipped':
          console.log(`  -> skipped (${outcome.reason})`);
          skippedCount++;
          break;
        case 'ok':
          console.log(`  -> ok (verified: ${outcome.verified.join(', ')})`);
          okCount++;
          break;
        case 'partial':
          console.log(
            `  -> partial (verified: ${outcome.verified.join(', ') || 'なし'}, failed: ${outcome.failed.join(', ')})`,
          );
          partialCount++;
          break;
        case 'error':
          console.error(`  -> error: ${outcome.message}`);
          errorCount++;
          break;
      }
    } catch (error) {
      console.error(`  -> unexpected error:`, error);
      errorCount++;
    }

    if (index < targets.length - 1) {
      await sleep(INTERVAL_MS);
    }
  }

  console.log(
    `\n[translate-backfill] 完了。ok: ${okCount} / partial: ${partialCount} / skipped: ${skippedCount} / error: ${errorCount}`,
  );
  if (partialCount > 0 || errorCount > 0) {
    console.log('[translate-backfill] partial/error があった記事は「生成中」のまま残っています。再実行すれば続きから処理されます。');
  }
}

main().catch((error) => {
  console.error('[translate-backfill] fatal error', error);
  process.exit(1);
});
