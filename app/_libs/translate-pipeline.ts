import { missingTranslationLangs, type News, type TranslationStatus } from './news';
import { updateNewsTranslation } from './microcms-management';
import { translateArticleLang } from './anthropic';
import type { TranslationSuffix } from './lang-registry';

// 「生成中」になってからこの時間以上経過していたら、処理が途中で止まった（滞留）と
// みなして再試行の対象にする。/api/translate-article（Webhook起点）と
// scripts/translate-backfill.ts（手動の一括実行）の両方から共有する。
export const STALE_GENERATING_MS = 10 * 60 * 1000; // 10分

// 同時に翻訳する言語数の上限。対象言語数（12言語対応後は最大11）ぶんを無制限に
// 並行実行すると、Anthropic APIのレート制限や輻輳による遅延の影響を受けやすくなる
// ため、上限を設けて順番に処理する。
const MAX_CONCURRENCY = 4;

// 1言語ぶんの翻訳リクエストのタイムアウト。ハングした1言語が他言語の処理・保存を
// 巻き込んで全体を止めないよう、十分短く打ち切る。
const PER_LANG_TIMEOUT_MS = 20_000;

// この経過時間を過ぎたら、新しい言語の翻訳を開始しない（既に走っているものは
// PER_LANG_TIMEOUT_MSで打ち切られるのを待つ）。/api/translate-article の
// maxDuration（60秒、route.ts参照）より十分小さい値にして、読み直し・ステータス
// 確定の書き込みに使う時間を残す。
const SOFT_DEADLINE_MS = 25_000;

/**
 * 「生成中」のまま滞留しているか（=ロックを無視して再試行してよいか）を判定する。
 * translation_started が無い（旧コードが生成中にした・書き込みに失敗した等）場合は、
 * 経過時間を判断できないため安全側に倒して「滞留していない」= 通常どおりスキップする。
 */
export const isStaleGenerating = (
  article: Pick<News, 'translation_status' | 'translation_started'>,
): boolean => {
  if (!article.translation_status?.includes('生成中')) return false;
  const startedAtMs = article.translation_started ? Date.parse(article.translation_started) : NaN;
  if (!Number.isFinite(startedAtMs)) return false;
  return Date.now() - startedAtMs >= STALE_GENERATING_MS;
};

export type TranslateOutcome =
  | { status: 'skipped'; reason: 'in progress' | 'already fully translated' }
  | { status: 'error'; message: string; attempted?: TranslationSuffix[]; failed?: TranslationSuffix[] }
  | {
      status: 'ok' | 'partial';
      verified: TranslationSuffix[];
      failed: TranslationSuffix[];
      translation_status: TranslationStatus;
    };

/**
 * 1記事ぶんの「未翻訳言語だけを翻訳し、書き込み後に読み直して検証する」処理。
 * /api/translate-article（Webhook起点）と scripts/translate-backfill.ts（手動の一括実行）の
 * 両方から呼ばれる、書き込み・検証・ステータス管理の唯一の実装。
 *
 * 呼び出し側の責務：
 * - 記事の取得（getListDetail）
 * - 「生成中」かつ滞留していない場合の多重実行防止チェック（isStaleGenerating で判定可能）
 *   ※ この関数自体は「生成中」であっても呼ばれれば処理を進める（ロック確認は呼び出し側で行う）
 *
 * 対象言語は MAX_CONCURRENCY 件ずつ並行実行し、1言語の翻訳ができ次第、他言語の完了を
 * 待たずにその場でmicroCMSへ書き込む（バッチでまとめて書き込まない）。こうすることで、
 * 一部の言語がハング・レート制限等で遅延・失敗しても、既に成功した言語の結果は
 * 呼び出し元の実行時間予算（Vercelのmaxduration等）を使い切って強制終了された場合でも
 * 失われない。SOFT_DEADLINE_MS を過ぎたら新規の翻訳は開始せず、残りは「生成中」のまま
 * 次回（Webhook再送信・滞留検知・バックフィルスクリプトの再実行のいずれか）に委ねる。
 *
 * @param reread 書き込み検証のための再取得関数。呼び出し元のクライアント（閲覧用/管理用）に委ねる
 */
export async function translatePendingLanguages(
  contentId: string,
  article: News,
  reread: () => Promise<News>,
): Promise<TranslateOutcome> {
  const missing = missingTranslationLangs(article);
  if (missing.length === 0) {
    // 無限ループ防止：全言語が翻訳済みの記事は、翻訳結果の保存が起こす2回目以降の
    // Webhookも含めて、ここで必ず止まる。
    if (!article.translation_status?.includes('完了')) {
      // ステータス表記だけが古い（例: 対応言語追加直後で、実際は既に全部埋まっている）
      // 場合は、翻訳は行わずステータスだけ補正する。
      await updateNewsTranslation(contentId, { translation_status: ['完了'] }).catch((error) => {
        console.error('[translate-pipeline] failed to correct translation_status', contentId, error);
      });
    }
    return { status: 'skipped', reason: 'already fully translated' };
  }

  try {
    await updateNewsTranslation(contentId, {
      translation_status: ['生成中'],
      translation_started: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[translate-pipeline] failed to lock article', contentId, error);
    return { status: 'error', message: 'failed to start translation' };
  }

  const startedAt = Date.now();
  const succeeded: TranslationSuffix[] = [];
  const failed: TranslationSuffix[] = [];
  let nextIndex = 0;

  const worker = async () => {
    while (Date.now() - startedAt < SOFT_DEADLINE_MS) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= missing.length) return;

      const suffix = missing[index];
      const langStartedAt = Date.now();
      try {
        const translation = await translateArticleLang(
          { title: article.title, contentHtml: article.content },
          suffix,
          PER_LANG_TIMEOUT_MS,
        );
        // 他言語の完了を待たず、翻訳できた言語からすぐに保存する。
        await updateNewsTranslation(contentId, {
          [`title_${suffix}`]: translation.title,
          [`content_${suffix}`]: translation.content,
        });
        succeeded.push(suffix);
      } catch (error) {
        failed.push(suffix);
        console.error('[translate-pipeline] translation failed', contentId, suffix, error);
      } finally {
        console.log(`[translate-pipeline] ${suffix} took ${Date.now() - langStartedAt}ms`, contentId);
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(MAX_CONCURRENCY, missing.length) }, () => worker()),
  );

  const notAttempted = missing.filter(
    (suffix) => !succeeded.includes(suffix) && !failed.includes(suffix),
  );
  if (notAttempted.length > 0) {
    console.warn(
      '[translate-pipeline] soft deadline reached before all languages were attempted, remaining for next run',
      contentId,
      notAttempted,
    );
  }

  // 書き込み検証：このリクエストで保存できたはずの言語を実際に読み直して確認する。
  // 書き込みAPIがエラーを返さなくても、対象フィールドが存在しない・反映されていない
  // 等の理由で実際には保存されていない場合があり得るため、応答が正常でも中身を
  // 信用せず、missingTranslationLangs で再度判定する。
  let rereadArticle: News;
  try {
    rereadArticle = await reread();
  } catch (error) {
    console.error('[translate-pipeline] failed to re-read article for verification', contentId, error);
    return {
      status: 'error',
      message: 'failed to re-read article for verification',
      attempted: succeeded,
      failed: [...failed, ...notAttempted],
    };
  }

  const stillMissing = missingTranslationLangs(rereadArticle);
  const allDone = stillMissing.length === 0;

  // 1つでも未翻訳の言語が残る場合、ステータスは「未処理」に戻さず「生成中」のまま
  // 残す。理由：本番にはまだ新パイプライン未対応の旧コードがデプロイされている
  // 可能性があり、旧コードは translation_status が「未処理」だと（「生成中」「完了」
  // 以外の値なので）多重実行防止チェックを素通りしてしまい、この記事の既存翻訳を
  // 独自に再生成・上書きしてしまう恐れがある。「生成中」のままにしておけば、新旧
  // どちらのコードの多重実行防止チェックにも確実に引っかかるため、旧コードによる
  // 上書きを防げる（STALE_GENERATING_MS 経過後は isStaleGenerating により自動的に
  // 再試行対象になる）。
  if (allDone) {
    try {
      await updateNewsTranslation(contentId, { translation_status: ['完了'] });
    } catch (error) {
      console.error('[translate-pipeline] failed to finalize translation_status', contentId, error);
      return {
        status: 'error',
        message: 'failed to finalize status',
        attempted: succeeded,
        failed: [],
      };
    }
  } else {
    console.error(
      '[translate-pipeline] leaving translation_status as 生成中: still missing',
      contentId,
      stillMissing,
    );
  }

  return {
    status: allDone ? 'ok' : 'partial',
    verified: succeeded.filter((suffix) => !stillMissing.includes(suffix)),
    failed: stillMissing,
    translation_status: allDone ? '完了' : '生成中',
  };
}
