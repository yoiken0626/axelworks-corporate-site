import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { client, type News } from '@/app/_libs/microcms';
import { isStaleGenerating, translatePendingLanguages } from '@/app/_libs/translate-pipeline';

// 未翻訳の対象言語を並行して翻訳するため、Next.jsのデフォルトより長めの実行時間を
// 確保する。60はVercel Hobbyプランでも設定できる上限値（Pro以上はより長く設定できる
// ので、プランに応じて引き上げてよい）。並行実行のため、対象言語が増えても実際の
// 所要時間は「最も遅い1言語ぶん」に近い（合計時間ではない）。
export const maxDuration = 60;

const isAuthorized = (request: NextRequest) => {
  const expected = process.env.TRANSLATE_WEBHOOK_SECRET;
  // シークレット未設定時はfail-closed（誰も呼び出せない状態）にする
  if (!expected) {
    return false;
  }

  const provided = request.headers.get('x-webhook-secret') || '';
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);

  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
};

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ status: 'error', message: 'unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: 'error', message: 'invalid JSON body' }, { status: 400 });
  }

  // microCMSの標準Webhookペイロードではトップレベルの`id`がcontentIdに相当する。
  // カスタムWebhookで {"contentId": "{{contentId}}"} 形式を設定している場合もそれを優先する。
  const contentId = (body.contentId ?? body.id) as string | undefined;
  if (!contentId || typeof contentId !== 'string') {
    return NextResponse.json(
      { status: 'error', message: 'contentId is required' },
      { status: 400 },
    );
  }

  let article: News & { id: string };
  try {
    article = await client.getListDetail<News>({ endpoint: 'news', contentId });
  } catch (error) {
    console.error('[translate-article] failed to fetch article', contentId, error);
    return NextResponse.json({ status: 'error', message: 'article not found' }, { status: 404 });
  }

  // 多重実行防止：現在処理中（生成中）の記事はスキップする。
  // 「翻訳済みかどうか」はステータス文字列ではなく、実際のフィールドの有無
  // （missingTranslationLangs、translatePendingLanguages内部で判定）で判定する。こうする
  // ことで、対応言語をレジストリに追加したあと、過去に「完了」した記事も、次にこの
  // APIが呼ばれたときに新しい言語だけを自動で埋め合わせられる（ステータスが「完了」の
  // まま固定されて永久にスキップされ続ける、という問題を避けられる）。
  //
  // ただし「生成中」になってから STALE_GENERATING_MS（10分）以上経過している場合は、
  // 処理が途中で落ちて滞留したとみなし、ロックを無視して再試行する（isStaleGenerating）。
  // 滞留と判定されなかった通常のロック中は、これまでどおりスキップする。
  if (article.translation_status?.includes('生成中') && !isStaleGenerating(article)) {
    return NextResponse.json(
      { status: 'skipped', reason: 'in progress', translation_status: article.translation_status },
      { status: 200 },
    );
  }
  if (article.translation_status?.includes('生成中')) {
    console.warn(
      '[translate-article] 生成中 stuck since',
      article.translation_started_at,
      '- treating as stalled and retrying',
      contentId,
    );
  }

  const outcome = await translatePendingLanguages(contentId, article, () =>
    client.getListDetail<News>({ endpoint: 'news', contentId }),
  );

  switch (outcome.status) {
    case 'skipped':
      return NextResponse.json({ status: 'skipped', reason: outcome.reason });
    case 'error':
      return NextResponse.json(
        {
          status: 'error',
          message: outcome.message,
          attempted: outcome.attempted,
          failed: outcome.failed,
        },
        { status: 500 },
      );
    case 'ok':
    case 'partial':
      return NextResponse.json({
        status: outcome.status,
        contentId,
        verified: outcome.verified,
        failed: outcome.failed,
        translation_status: outcome.translation_status,
      });
    default: {
      const exhaustiveCheck: never = outcome;
      throw new Error(`unhandled outcome: ${JSON.stringify(exhaustiveCheck)}`);
    }
  }
}
