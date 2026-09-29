import { missingTranslationLangs, type News, type TranslationStatus } from './news';
import { updateNewsTranslation } from './microcms-management';
import { translateArticleLang } from './anthropic';
import type { TranslationSuffix } from './lang-registry';

// 「生成中」になってからこの時間以上経過していたら、処理が途中で止まった（滞留）と
// みなして再試行の対象にする。/api/translate-article（Webhook起点）と
// scripts/translate-backfill.ts（手動の一括実行）の両方から共有する。
export const STALE_GENERATING_MS = 10 * 60 * 1000; // 10分

/**
 * 「生成中」のまま滞留しているか（=ロックを無視して再試行してよいか）を判定する。
 * translation_started_at が無い（旧コードが生成中にした・書き込みに失敗した等）場合は、
 * 経過時間を判断できないため安全側に倒して「滞留していない」= 通常どおりスキップする。
 */
export const isStaleGenerating = (
  article: Pick<News, 'translation_status' | 'translation_started_at'>,
): boolean => {
  if (!article.translation_status?.includes('生成中')) return false;
  const startedAtMs = article.translation_started_at ? Date.parse(article.translation_started_at) : NaN;
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
      translation_started_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[translate-pipeline] failed to lock article', contentId, error);
    return { status: 'error', message: 'failed to start translation' };
  }

  // 未翻訳の言語だけを、言語ごとに独立したAPI呼び出しで並行に翻訳する。
  // 1言語の失敗（レート制限・一時的なAPIエラー等）が他言語に波及しないよう
  // Promise.allSettled を使う。所要時間は診断用に言語ごとに計測してログに残す
  // （認証情報等は含まないため出力して問題ない）。
  const settled = await Promise.allSettled(
    missing.map(async (suffix) => {
      const startedAt = Date.now();
      try {
        return await translateArticleLang({ title: article.title, contentHtml: article.content }, suffix);
      } finally {
        console.log(`[translate-pipeline] ${suffix} took ${Date.now() - startedAt}ms`, contentId);
      }
    }),
  );

  const fields: Record<string, string> = {};
  const attempted: TranslationSuffix[] = [];
  const failed: TranslationSuffix[] = [];

  settled.forEach((result, index) => {
    const suffix = missing[index];
    if (result.status === 'fulfilled') {
      fields[`title_${suffix}`] = result.value.title;
      fields[`content_${suffix}`] = result.value.content;
      attempted.push(suffix);
    } else {
      failed.push(suffix);
      console.error('[translate-pipeline] translation failed', contentId, suffix, result.reason);
    }
  });

  // Anthropicが返した分だけ書き込む（失敗した言語のフィールドには触れない）。
  if (Object.keys(fields).length > 0) {
    try {
      await updateNewsTranslation(contentId, fields);
    } catch (error) {
      console.error('[translate-pipeline] failed to save translation', contentId, error);
      // 書き込み自体が失敗した場合、ステータスは「生成中」のまま残す（下記の
      // 「なぜ未処理に戻さないか」のコメントと同じ理由）。次は再実行（Webhook再送信・
      // 滞留検知・バックフィルスクリプトの再実行のいずれか）が必要。
      return { status: 'error', message: 'failed to save translation', attempted, failed };
    }
  }

  // 書き込み検証：保存したはずの言語を実際に読み直し、title_*/content_* の両方に
  // 値が入っているか確認してから初めて「成功」とみなす。書き込みAPIがエラーを
  // 返さなくても、対象フィールドが存在しない・反映されていない等の理由で実際には
  // 保存されていない場合があり得るため、応答が正常でも中身を信用しない。
  const verified: TranslationSuffix[] = [];
  const verificationFailed: TranslationSuffix[] = [...failed];
  if (attempted.length > 0) {
    let rereadArticle: News;
    try {
      rereadArticle = await reread();
    } catch (error) {
      console.error('[translate-pipeline] failed to re-read article for verification', contentId, error);
      rereadArticle = article; // 読み直し自体に失敗した場合は、安全側に倒して全て未検証扱いにする
    }
    for (const suffix of attempted) {
      const ok = !!rereadArticle[`title_${suffix}`] && !!rereadArticle[`content_${suffix}`];
      if (ok) {
        verified.push(suffix);
      } else {
        verificationFailed.push(suffix);
        console.error('[translate-pipeline] verification failed after write', contentId, suffix);
      }
    }
  }

  // 全対象言語（今回未翻訳だった言語すべて）が検証まで通った場合のみ「完了」にする。
  // 1つでも失敗・未検証が残る場合、ステータスは「未処理」に戻さず「生成中」のまま
  // 残す。理由：本番にはまだ新パイプライン未対応の旧コードがデプロイされており、
  // 旧コードは translation_status が「未処理」だと（「生成中」「完了」以外の値なので）
  // 多重実行防止チェックを素通りしてしまい、この記事の英語などの既存翻訳を独自に
  // 再生成・上書きしてしまう恐れがある。「生成中」のままにしておけば、新旧どちらの
  // コードの多重実行防止チェックにも確実に引っかかるため、旧コードによる上書きを
  // 防げる。新パイプラインが本番稼働した後も、「生成中」のまま残しておいて問題ない
  // （STALE_GENERATING_MS 経過後は isStaleGenerating により自動的に再試行対象になる）。
  const allVerified = verificationFailed.length === 0;
  const finalStatus: TranslationStatus | null = allVerified ? '完了' : null;

  if (finalStatus) {
    try {
      await updateNewsTranslation(contentId, { translation_status: [finalStatus] });
    } catch (error) {
      console.error('[translate-pipeline] failed to finalize translation_status', contentId, error);
      return {
        status: 'error',
        message: 'failed to finalize status',
        attempted: verified,
        failed: verificationFailed,
      };
    }
  } else {
    console.error(
      '[translate-pipeline] leaving translation_status as 生成中 due to unverified/failed languages',
      contentId,
      verificationFailed,
    );
  }

  return {
    status: allVerified ? 'ok' : 'partial',
    verified,
    failed: verificationFailed,
    translation_status: finalStatus ?? '生成中',
  };
}
