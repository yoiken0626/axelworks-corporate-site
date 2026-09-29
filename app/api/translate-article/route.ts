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
  // され続ける、という問題を避けられる）。このチェックは意図的に「生成中」だけを
  // 見る（「完了」は見ない）ため、status=完了でも missingTranslationLangs が非空を
  // 返す記事は下の分岐で翻訳対象になる。
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
  // Promise.allSettled を使う。所要時間は診断用に言語ごとに計測してログに残す
  // （認証情報等は含まないため出力して問題ない）。
  const settled = await Promise.allSettled(
    missing.map(async (suffix) => {
      const startedAt = Date.now();
      try {
        return await translateArticleLang({ title: article.title, contentHtml: article.content }, suffix);
      } finally {
        console.log(`[translate-article] ${suffix} took ${Date.now() - startedAt}ms`, contentId);
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
      console.error('[translate-article] translation failed', contentId, suffix, result.reason);
    }
  });

  // Anthropicが返した分だけ書き込む（失敗した言語のフィールドには触れない）。
  if (Object.keys(fields).length > 0) {
    try {
      await updateNewsTranslation(contentId, fields);
    } catch (error) {
      console.error('[translate-article] failed to save translation', contentId, error);
      // 書き込み自体が失敗した場合、ステータスは「生成中」のまま残す（下記の
      // 「なぜ未処理に戻さないか」のコメントと同じ理由）。次は手動での再実行が必要。
      return NextResponse.json(
        { status: 'error', message: 'failed to save translation', attempted, failed },
        { status: 500 },
      );
    }
  }

  // 書き込み検証：保存したはずの言語を実際に読み直し、title_*/content_* の両方に
  // 値が入っているか確認してから初めて「成功」とみなす。書き込みAPIがエラーを
  // 返さなくても、対象フィールドが存在しない・反映されていない等の理由で実際には
  // 保存されていない場合があり得るため、応答が正常でも中身を信用しない。
  const verified: TranslationSuffix[] = [];
  const verificationFailed: TranslationSuffix[] = [...failed];
  if (attempted.length > 0) {
    let reread: News;
    try {
      reread = await client.getListDetail<News>({ endpoint: 'news', contentId });
    } catch (error) {
      console.error(
        '[translate-article] failed to re-read article for verification',
        contentId,
        error,
      );
      reread = article; // 読み直し自体に失敗した場合は、安全側に倒して全て未検証扱いにする
    }
    for (const suffix of attempted) {
      const ok = !!reread[`title_${suffix}`] && !!reread[`content_${suffix}`];
      if (ok) {
        verified.push(suffix);
      } else {
        verificationFailed.push(suffix);
        console.error('[translate-article] verification failed after write', contentId, suffix);
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
  // 防げる（新パイプラインが本番稼働した後は、この制約は不要になるため「未処理」に
  // 戻して自動再試行させる設計に戻してよい）。
  const allVerified = verificationFailed.length === 0;
  const finalStatus: TranslationStatus | null = allVerified ? '完了' : null;

  if (finalStatus) {
    try {
      await updateNewsTranslation(contentId, { translation_status: [finalStatus] });
    } catch (error) {
      console.error('[translate-article] failed to finalize translation_status', contentId, error);
      return NextResponse.json(
        {
          status: 'error',
          message: 'failed to finalize status',
          verified,
          failed: verificationFailed,
        },
        { status: 500 },
      );
    }
  } else {
    console.error(
      '[translate-article] leaving translation_status as 生成中 due to unverified/failed languages',
      contentId,
      verificationFailed,
    );
  }

  return NextResponse.json({
    status: allVerified ? 'ok' : 'partial',
    contentId,
    verified,
    failed: verificationFailed,
    translation_status: finalStatus ?? '生成中',
  });
}
