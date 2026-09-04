import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { client, type News, type TranslationStatus } from '@/app/_libs/microcms';
import { updateNewsTranslation } from '@/app/_libs/microcms-management';
import { translateArticle } from '@/app/_libs/anthropic';

const IN_PROGRESS_STATUSES: TranslationStatus[] = ['生成中', '完了'];

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

  // 無限ループ防止：翻訳中/翻訳済みの記事は即座にスキップする
  // translation_statusはmicroCMSのSelectable Field（複数選択）のため配列で返る
  if (article.translation_status?.some((status) => IN_PROGRESS_STATUSES.includes(status))) {
    return NextResponse.json(
      { status: 'skipped', translation_status: article.translation_status },
      { status: 200 },
    );
  }

  try {
    await updateNewsTranslation(contentId, { translation_status: ['生成中'] });
  } catch (error) {
    console.error('[translate-article] failed to lock article', contentId, error);
    return NextResponse.json(
      { status: 'error', message: 'failed to start translation' },
      { status: 500 },
    );
  }

  try {
    // 1回の呼び出しで英語・韓国語をまとめて生成する
    const { title_en, content_en, title_ko, content_ko } = await translateArticle({
      title: article.title,
      contentHtml: article.content,
    });

    await updateNewsTranslation(contentId, {
      title_en,
      content_en,
      title_ko,
      content_ko,
      translation_status: ['完了'],
    });

    return NextResponse.json({ status: 'ok', contentId, langs: ['en', 'ko'] });
  } catch (error) {
    console.error('[translate-article] translation failed', contentId, error);

    try {
      await updateNewsTranslation(contentId, { translation_status: ['未処理'] });
    } catch (revertError) {
      console.error(
        '[translate-article] failed to revert translation_status',
        contentId,
        revertError,
      );
    }

    return NextResponse.json({ status: 'error', message: 'translation failed' }, { status: 500 });
  }
}
