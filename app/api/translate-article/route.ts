import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  client,
  missingTranslationLangs,
  type News,
  type TranslationStatus,
} from '@/app/_libs/microcms';
import { updateNewsTranslation } from '@/app/_libs/microcms-management';
import { translateArticleLang } from '@/app/_libs/anthropic';
import type { TranslationSuffix } from '@/app/_libs/lang';

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
  // （missingTranslationLangs）で判定する。こうすることで、対応言語をレジストリに
  // 追加したあと、過去に「完了」した記事も、次にこのAPIが呼ばれたときに新しい言語
  // だけを自動で埋め合わせられる（ステータスが「完了」のまま固定されて永久にスキップ
  // され続ける、という問題を避けられる）。
  if (article.translation_status?.includes('生成中')) {
    return NextResponse.json(
      { status: 'skipped', reason: 'in progress', translation_status: article.translation_status },
      { status: 200 },
    );
  }

  const missing = missingTranslationLangs(article);
  if (missing.length === 0) {
    // 無限ループ防止：全言語が翻訳済みの記事は、翻訳結果の保存が起こす2回目以降の
    // Webhookも含めて、ここで必ず止まる。
    if (!article.translation_status?.includes('完了')) {
      // ステータス表記だけが古い（例: 対応言語追加直後で、実際は既に全部埋まっている）
      // 場合は、翻訳は行わずステータスだけ補正する。
      await updateNewsTranslation(contentId, { translation_status: ['完了'] }).catch((error) => {
        console.error('[translate-article] failed to correct translation_status', contentId, error);
      });
    }
    return NextResponse.json({ status: 'skipped', reason: 'already fully translated' });
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

  // 未翻訳の言語だけを、言語ごとに独立したAPI呼び出しで並行に翻訳する。
  // 1言語の失敗（レート制限・一時的なAPIエラー等）が他言語に波及しないよう
  // Promise.allSettled を使い、失敗した言語のフィールドは書き込まない
  // （＝次回このAPIが呼ばれたときに missingTranslationLangs が再び対象として返す
  // ので、失敗した言語だけが自然に再試行される）。
  const settled = await Promise.allSettled(
    missing.map((suffix) =>
      translateArticleLang({ title: article.title, contentHtml: article.content }, suffix),
    ),
  );

  const fields: Record<string, string> = {};
  const translated: TranslationSuffix[] = [];
  const failed: TranslationSuffix[] = [];

  settled.forEach((result, index) => {
    const suffix = missing[index];
    if (result.status === 'fulfilled') {
      fields[`title_${suffix}`] = result.value.title;
      fields[`content_${suffix}`] = result.value.content;
      translated.push(suffix);
    } else {
      failed.push(suffix);
      console.error('[translate-article] translation failed', contentId, suffix, result.reason);
    }
  });

  // 今回の対象言語（未翻訳だった言語）のうち、翻訳が失敗して残った言語が無ければ
  // 「完了」、1つでも残っていれば「未処理」に戻す（次回の呼び出しで、残った言語
  // だけが missingTranslationLangs により再試行される）。
  const finalStatus: TranslationStatus = failed.length === 0 ? '完了' : '未処理';

  try {
    await updateNewsTranslation(contentId, { ...fields, translation_status: [finalStatus] });
  } catch (error) {
    console.error('[translate-article] failed to save translation', contentId, error);
    return NextResponse.json(
      { status: 'error', message: 'failed to save translation', translated, failed },
      { status: 500 },
    );
  }

  return NextResponse.json({
    status: failed.length === 0 ? 'ok' : 'partial',
    contentId,
    translated,
    failed,
  });
}
