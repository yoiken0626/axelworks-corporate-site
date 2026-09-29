import { after, NextRequest, NextResponse } from 'next/server';
import { client, type News } from '@/app/_libs/microcms';
import { isStaleGenerating, translatePendingLanguages } from '@/app/_libs/translate-pipeline';
import {
  CONTINUATION_HEADER,
  getContinuationCount,
  isAuthorized,
  shouldScheduleContinuation,
} from '@/app/_libs/translate-webhook';

// 未翻訳の対象言語を並行して翻訳するための実行時間。
// Vercelダッシュボード（Settings → Functions）で確認済み: 本プロジェクトはFluid
// Computeが有効で、Hobbyプランでの関数実行時間は300秒が既定値かつ上限（これが
// このプロジェクトで設定できる実行時間の上限）。
// ローカル計測（jrfu_fjoeと同程度の長さの記事）で、ネパール語の翻訳に61.4秒かかる
// ケースを確認しており、1言語の翻訳だけでも相応の時間がかかり得る。300秒あれば、
// 1言語あたりのタイムアウト（PER_LANG_TIMEOUT_MS=90秒、translate-pipeline.ts参照）
// に対して観測値の約5倍の余裕があり、同時実行数（MAX_CONCURRENCY=4）で対象言語
// 最大11件を処理しても、通常は1回のリクエスト内で全言語が完了する（本文を分けて
// 翻訳する必要はない）。後段の自己継続（scheduleContinuation）は、稀に1回で
// 完了しきれなかった場合（レート制限・想定以上の遅延など）のための安全網として残す。
export const maxDuration = 300;

// 1回のリクエストで処理しきれなかった言語が残っている場合に、自分自身
// （/api/translate-article）をもう一度呼び出して続きを処理させるための仕組み。
// Vercel Cron Jobsによる定期スキャンも検討したが、（1）Cron Jobsの実行間隔は
// プランに依存し、Hobbyプランでは1日1回までに制限され得るため記事公開直後の
// 自動完了には向かない、（2）記事公開のタイミングで即座に反応できる、という理由から
// 自己継続方式を採用した。
//
// 認証について: x-translate-continuation ヘッダーは、多重実行防止の「生成中」ロック
// チェックだけをバイパスする（＝同じ処理チェーンの続きであると判別するための印）
// もので、認証をバイパスするものではない。POST関数はこのヘッダーの有無に関わらず
// 冒頭で isAuthorized(request) を必ず通す（下記参照）ため、正しい
// TRANSLATE_WEBHOOK_SECRET を持たないリクエストは、このヘッダーを付けていても
// 401で拒否される。無限ループ防止のため、継続回数にも上限を設ける
// （MAX_CONTINUATIONS、app/_libs/translate-webhook.ts）。
// isAuthorized / getContinuationCount / shouldScheduleContinuation は、
// app/_libs/translate-webhook.ts に切り出している（Next.jsのRoute Handlerは
// GET/POST/maxDuration等の決められた名前しかexportできないため、ローカルの
// モックテストで単体importできるロジックはそちらに置く方針にした）。

// レスポンスを返したあとに、続きの処理を担う新しいリクエストを自分自身に送る。
// Vercelの関数は、クライアント（今回であれば継続元のこのリクエスト自身）が
// 応答を待たずに切断しても、maxDurationに達するまで実行を継続する（=送信した
// リクエストは新しい別の関数実行として独立に走り続ける）。ここでは送信自体が
// 完了するのを少し待つだけで、相手（続きの処理）の完了は待たない＝この呼び出し元
// の実行時間を消費しない。
const scheduleContinuation = (contentId: string, nextAttempt: number) => {
  const baseUrl = process.env.BASE_URL;
  const secret = process.env.TRANSLATE_WEBHOOK_SECRET;
  if (!baseUrl || !secret) {
    console.error(
      '[translate-article] cannot schedule continuation: BASE_URL or TRANSLATE_WEBHOOK_SECRET is missing',
      contentId,
    );
    return;
  }

  after(async () => {
    const url = `${baseUrl.replace(/\/$/, '')}/api/translate-article`;
    const controller = new AbortController();
    // 送信（相手に届くまで）だけを短時間待つ。相手の処理完了は待たないため、
    // この時間はこの呼び出し元の実行時間予算をほとんど消費しない。
    const abortTimer = setTimeout(() => controller.abort(), 5_000);
    try {
      await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          'x-webhook-secret': secret,
          [CONTINUATION_HEADER]: String(nextAttempt),
        },
        body: JSON.stringify({ contentId }),
      });
    } catch (error) {
      if (!controller.signal.aborted) {
        console.error(
          '[translate-article] failed to trigger continuation request',
          contentId,
          nextAttempt,
          error,
        );
      }
    } finally {
      clearTimeout(abortTimer);
    }
  });
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

  const continuationCount = getContinuationCount(request);
  const isContinuation = continuationCount > 0;

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
  // ただし以下の場合はロックを無視して処理を進める:
  // - 継続リクエスト（isContinuation）: 自分自身が起こした、同じ処理チェーンの続き
  //   であることが x-translate-continuation ヘッダー（+ 認証済みのWebhookシークレット）
  //   から分かるため、多重実行ではない
  // - 「生成中」になってから STALE_GENERATING_MS（10分）以上経過している場合
  //   （isStaleGenerating）: 処理が途中で落ちて滞留したとみなし再試行する
  // それ以外の、通常のロック中は、これまでどおりスキップする。
  if (article.translation_status?.includes('生成中')) {
    if (isContinuation) {
      console.log(
        '[translate-article] continuation request, proceeding despite 生成中 lock',
        contentId,
        'attempt',
        continuationCount,
      );
    } else if (!isStaleGenerating(article)) {
      return NextResponse.json(
        { status: 'skipped', reason: 'in progress', translation_status: article.translation_status },
        { status: 200 },
      );
    } else {
      console.warn(
        '[translate-article] 生成中 stuck since',
        article.translation_started,
        '- treating as stalled and retrying',
        contentId,
      );
    }
  }

  const outcome = await translatePendingLanguages(contentId, article, () =>
    client.getListDetail<News>({ endpoint: 'news', contentId }),
  );

  // 未翻訳の言語がまだ残っている（partial）、または処理中にエラーが起きた場合、
  // 継続回数が上限に達していなければ自分自身を呼び出して続きを処理させる。
  // これにより、1回のリクエストの実行時間内に全言語を訳しきれなくても、
  // 人手を介さず最終的に「完了」まで到達できる。
  const shouldContinue = shouldScheduleContinuation(outcome.status, continuationCount);

  if (shouldContinue) {
    scheduleContinuation(contentId, continuationCount + 1);
  } else if (outcome.status === 'partial') {
    // MAX_CONTINUATIONSに達しても未翻訳の言語が残っているケース。ここで止まり、
    // translation_status は「生成中」のまま残る（=次のWebhook・滞留検知・
    // バックフィルスクリプトの再実行のいずれかを待つ状態になる）。どの言語が
    // 残ったかをログに残す（Hobbyプランはログ保持期間が短いため、気づいたら
    // すぐダッシュボードで確認するか、translate-pipeline.ts側の言語ごとの
    // 失敗ログ〔lang=/kind=/httpStatus=〕と合わせて原因を確認すること）。
    console.error(
      '[translate-article] MAX_CONTINUATIONS reached, stopping with translation_status still 生成中',
      contentId,
      'continuationCount',
      continuationCount,
      'remaining',
      outcome.failed,
    );
  }

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
          continuation: shouldContinue ? continuationCount + 1 : undefined,
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
        continuation: shouldContinue ? continuationCount + 1 : undefined,
      });
    default: {
      const exhaustiveCheck: never = outcome;
      throw new Error(`unhandled outcome: ${JSON.stringify(exhaustiveCheck)}`);
    }
  }
}
