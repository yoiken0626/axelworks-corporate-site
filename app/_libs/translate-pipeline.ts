import { missingTranslationLangs, type News, type TranslationStatus } from './news';
import { updateNewsTranslation } from './microcms-management';
import { translateArticleLang, TranslationError } from './anthropic';
import type { TranslationSuffix } from './lang-registry';

// 「生成中」になってからこの時間以上経過していたら、処理が途中で止まった（滞留）と
// みなして再試行の対象にする。/api/translate-article（Webhook起点）と
// scripts/translate-backfill.ts（手動の一括実行）の両方から共有する。
export const STALE_GENERATING_MS = 10 * 60 * 1000; // 10分

// 同時に翻訳する言語数の上限。対象言語数（12言語対応後は最大11）ぶんを無制限に
// 並行実行すると、Anthropic APIのレート制限や輻輳による遅延の影響を受けやすくなる
// ため、上限を設けて順番に処理する（本番でこの問題が実際に起きたことを、Vercelの
// 実行ログ〔200 OKで約157秒・全言語失敗〕から確認済み）。
const MAX_CONCURRENCY = 4;

// 1言語ぶんの翻訳リクエストのタイムアウト。ハングした1言語が他言語の処理・保存を
// 巻き込んで全体を止めないよう打ち切る。
//
// 値の根拠: jrfu_fjoe（本文2070文字）と同程度の長さの記事で実測したところ、
// 英語は20.8秒、ネパール語は61.4秒かかった（2026-09-29計測、書き込みなし）。
// 対応言語の中では非CJK・非ラテン文字（ネパール語・ロシア語等）が特に時間を要する
// 傾向があるため、観測値（最大61.4秒）に対して+約5割の余裕を持たせている。より長い
// 記事ではさらに時間がかかる可能性があるため、Vercelの実行ログで実際のtook ms（
// translate-pipeline.ts のログ）を継続的に確認し、必要なら調整すること。
const PER_LANG_TIMEOUT_MS = 90_000;

// この経過時間を過ぎたら、新しい言語の翻訳を開始しない（既に走っているものは
// PER_LANG_TIMEOUT_MSで打ち切られるのを待つ）。/api/translate-article の
// maxDuration（300秒、route.ts参照。Vercelダッシュボードで確認したHobby+Fluid
// Computeの上限）より十分小さい値にして、1言語ぶんのタイムアウト
// （PER_LANG_TIMEOUT_MS）と、読み直し・ステータス確定の書き込みに使う時間を残す：
// 300 - 90（1言語タイムアウト）- 20（書き込み等のバッファ）= 190秒。
// 同時実行数（MAX_CONCURRENCY=4）で対象言語（最大11）を処理する場合、最悪でも
// ceil(11/4)=3ラウンド。1ラウンドが観測値程度（数十秒）で終わる通常のケースでは、
// 190秒の猶予内に3ラウンドとも開始でき、1回のリクエストで全言語が完了する
// （本文を分割する必要はない）。仮に複数言語が同時にPER_LANG_TIMEOUT_MS近くまで
// かかる稀なケースでは、一部の言語がこの猶予を過ぎて未着手のまま残るが、その分は
// route.ts の自己継続（scheduleContinuation）が次のリクエストとして引き継ぐ。
const SOFT_DEADLINE_MS = 190_000;

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

export type TranslateDeps = {
  translate?: typeof translateArticleLang;
  write?: typeof updateNewsTranslation;
};

export type LockResult =
  // 翻訳すべき言語が無かった（既に完了している）、またはロック取得自体に失敗した場合。
  // どちらもmicroCMSへの書き込みは高々1回で、時間のかかる翻訳処理は発生しないため、
  // 呼び出し側は応答をバックグラウンドに回さず、そのまま同期的に返してよい。
  | { locked: false; outcome: TranslateOutcome }
  // ロック（translation_status='生成中' + translation_started）の書き込みに成功した状態。
  // 呼び出し側はここで応答を返してよく、実際の翻訳は runTranslation に任せられる。
  | { locked: true };

/**
 * 翻訳が必要かどうかを判定し、必要ならロック（translation_status='生成中' +
 * translation_started）を書き込むところまでを行う、高速な（microCMSへの書き込み1回だけの）
 * 処理。/api/translate-article が「すぐに応答を返す」ために、時間のかかる実際の翻訳
 * （runTranslation）と切り離してある。
 *
 * 呼び出し側の責務は translatePendingLanguages と同じ（記事の取得・多重実行防止チェック）。
 */
export async function acquireTranslationLock(
  contentId: string,
  article: News,
  deps: TranslateDeps = {},
): Promise<LockResult> {
  const write = deps.write ?? updateNewsTranslation;

  const missing = missingTranslationLangs(article);
  if (missing.length === 0) {
    // 無限ループ防止：全言語が翻訳済みの記事は、翻訳結果の保存が起こす2回目以降の
    // Webhookも含めて、ここで必ず止まる。
    if (!article.translation_status?.includes('完了')) {
      // ステータス表記だけが古い（例: 対応言語追加直後で、実際は既に全部埋まっている）
      // 場合は、翻訳は行わずステータスだけ補正する。
      await write(contentId, { translation_status: ['完了'] }).catch((error) => {
        console.error('[translate-pipeline] failed to correct translation_status', contentId, error);
      });
    }
    return { locked: false, outcome: { status: 'skipped', reason: 'already fully translated' } };
  }

  try {
    await write(contentId, {
      translation_status: ['生成中'],
      translation_started: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[translate-pipeline] failed to lock article', contentId, error);
    return { locked: false, outcome: { status: 'error', message: 'failed to start translation' } };
  }

  return { locked: true };
}

/**
 * ロック取得済み（acquireTranslationLockがlocked:trueを返した）であることを前提に、
 * 未翻訳言語だけを翻訳し、書き込み後に読み直して検証する処理本体。
 * /api/translate-article（Webhook起点、after()内で呼ばれる）と
 * scripts/translate-backfill.ts（手動の一括実行）の両方から呼ばれる。
 *
 * 対象言語は MAX_CONCURRENCY 件ずつ並行実行し、1言語の翻訳ができ次第、他言語の完了を
 * 待たずにその場でmicroCMSへ書き込む（バッチでまとめて書き込まない）。こうすることで、
 * 一部の言語がハング・レート制限等で遅延・失敗しても、既に成功した言語の結果は
 * 呼び出し元の実行時間予算（Vercelのmaxduration等）を使い切って強制終了された場合でも
 * 失われない。SOFT_DEADLINE_MS を過ぎたら新規の翻訳は開始せず、残りは「生成中」のまま
 * 次回（Webhook再送信・滞留検知・バックフィルスクリプトの再実行のいずれか）に委ねる。
 *
 * @param reread 書き込み検証のための再取得関数。呼び出し元のクライアント（閲覧用/管理用）に委ねる
 * @param deps 翻訳・書き込みの実装を差し替えるためのフック（省略時は実際のAnthropic API /
 *   microCMSへの書き込みを使う）。ローカルでのモックテスト専用で、本番のroute.ts /
 *   scripts/translate-backfill.ts はどちらも渡さず、実際の実装がそのまま使われる。
 */
export async function runTranslation(
  contentId: string,
  article: News,
  reread: () => Promise<News>,
  deps: TranslateDeps = {},
): Promise<TranslateOutcome> {
  const translate = deps.translate ?? translateArticleLang;
  const write = deps.write ?? updateNewsTranslation;

  const missing = missingTranslationLangs(article);
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
        const translation = await translate(
          { title: article.title, contentHtml: article.content },
          suffix,
          PER_LANG_TIMEOUT_MS,
        );
        // 他言語の完了を待たず、翻訳できた言語からすぐに保存する。
        await write(contentId, {
          [`title_${suffix}`]: translation.title,
          [`content_${suffix}`]: translation.content,
        });
        succeeded.push(suffix);
      } catch (error) {
        failed.push(suffix);
        // 言語コード・エラーの種類・HTTPステータスが一目で分かる形で1行にまとめる。
        // Hobbyプランはログの保持期間が短いため、原因調査のために詳細を都度確認する
        // 前提ではなく、この1行だけで判断できることを重視している。
        const kind = error instanceof TranslationError ? error.kind : 'unknown';
        const httpStatus = error instanceof TranslationError ? (error.httpStatus ?? '-') : '-';
        const message = error instanceof Error ? error.message : String(error);
        console.error(
          `[translate-pipeline] translation failed lang=${suffix} kind=${kind} httpStatus=${httpStatus} message=${message}`,
          contentId,
        );
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
      await write(contentId, { translation_status: ['完了'] });
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

/**
 * acquireTranslationLock + runTranslation をまとめて同期的に行う、従来どおりの
 * 「呼び出したら完了まで待つ」インターフェース。scripts/translate-backfill.ts
 * （応答を急ぐ必要のないローカル実行専用スクリプト）はこちらを使う。
 * /api/translate-article は、すぐに応答を返すためロック取得と実処理を分離して
 * 個別に呼ぶ（acquireTranslationLock を先に呼び、応答後に runTranslation をafter()内で呼ぶ）。
 */
export async function translatePendingLanguages(
  contentId: string,
  article: News,
  reread: () => Promise<News>,
  deps: TranslateDeps = {},
): Promise<TranslateOutcome> {
  const lockResult = await acquireTranslationLock(contentId, article, deps);
  if (!lockResult.locked) {
    return lockResult.outcome;
  }
  return runTranslation(contentId, article, reread, deps);
}
