import { after, NextRequest, NextResponse } from 'next/server';
import { client, type News } from '@/app/_libs/microcms';
import {
  acquireTranslationLock,
  isStaleGenerating,
  runTranslation,
  type TranslateOutcome,
} from '@/app/_libs/translate-pipeline';
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

// 続きの処理を担う新しいリクエストを自分自身に送る（送信するだけで、相手の処理完了は
// 待たない）。Vercelの関数は、送信元のこの呼び出しが応答を返した（＝クライアントが
// 切断した）あとも、maxDurationに達するまで実行を継続する（=送信したリクエストは
// 新しい別の関数実行として独立に走り続ける）ため、ここでは送信自体が完了するのを
// 短時間待つだけでよい。
//
// 呼び出し側（after()内、または後述のロック取得失敗時）で await される想定。
// このリクエスト自身の応答（202/skipped/error）を返した後に呼ぶ場合は after() で
// 包んで使う。
const CONTINUATION_SEND_TIMEOUT_MS = 5_000;

const sendContinuationRequest = async (contentId: string, nextAttempt: number) => {
  const baseUrl = process.env.BASE_URL;
  const secret = process.env.TRANSLATE_WEBHOOK_SECRET;
  if (!baseUrl || !secret) {
    console.error(
      '[translate-article] cannot schedule continuation: BASE_URL or TRANSLATE_WEBHOOK_SECRET is missing',
      contentId,
    );
    return;
  }

  const url = `${baseUrl.replace(/\/$/, '')}/api/translate-article`;
  const controller = new AbortController();
  // 送信（相手に届くまで）だけを短時間待つ。相手の処理完了は待たないため、
  // この時間はこの呼び出し元の実行時間予算をほとんど消費しない。
  const abortTimer = setTimeout(() => controller.abort(), CONTINUATION_SEND_TIMEOUT_MS);
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
      console.error('[translate-article] failed to trigger continuation request', contentId, nextAttempt, error);
    }
  } finally {
    clearTimeout(abortTimer);
  }
};

// 翻訳結果を踏まえて、自分自身に続きの処理を依頼するリクエストを送るべきか判定し、
// 必要なら送る（送信は待つが、相手の処理完了は待たない）。上限に達した場合は、
// translation_status が「生成中」のまま残ることをログに記録する。
const maybeScheduleContinuation = async (
  outcome: TranslateOutcome,
  contentId: string,
  continuationCount: number,
): Promise<number | undefined> => {
  const shouldContinue = shouldScheduleContinuation(outcome.status, continuationCount);
  if (shouldContinue) {
    await sendContinuationRequest(contentId, continuationCount + 1);
    return continuationCount + 1;
  }
  if (outcome.status === 'partial') {
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
  return undefined;
};

const buildOutcomeResponse = (outcome: TranslateOutcome, contentId: string, continuation: number | undefined) => {
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
          continuation,
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
        continuation,
      });
    default: {
      const exhaustiveCheck: never = outcome;
      throw new Error(`unhandled outcome: ${JSON.stringify(exhaustiveCheck)}`);
    }
  }
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

  // ロック取得（翻訳が必要かどうかの判定＋必要ならtranslation_status='生成中'の書き込み）
  // だけをここで行い、時間のかかる実際の翻訳（runTranslation）は待たない。
  // microCMSへの書き込みは高々1回のみで、数百ms程度で終わる想定。
  const lockResult = await acquireTranslationLock(contentId, article);

  if (!lockResult.locked) {
    // 既に翻訳済み（skipped）、またはロック自体の書き込みに失敗した（error）場合。
    // 応答自体はすぐ返す。ロック取得失敗（error）は継続の対象になり得るため、
    // その送信だけはafter()に回し、応答を遅らせない（skippedの場合は
    // shouldScheduleContinuationが常にfalseになるため、ここは何も起きない）。
    const outcome = lockResult.outcome;
    const continuation = shouldScheduleContinuation(outcome.status, continuationCount)
      ? continuationCount + 1
      : undefined;
    after(() => maybeScheduleContinuation(outcome, contentId, continuationCount));
    return buildOutcomeResponse(outcome, contentId, continuation);
  }

  // ここでロックの取得（＝「生成中」の書き込み）は完了している。実際の翻訳は
  // 応答を返したあとにafter()内で行う。Webhook（microCMS）は翻訳の完了を待たずに
  // 応答を受け取れる。after()のコールバックはこの関数の応答が返ったあとに実行され、
  // maxDuration（300秒）に達するまで実行が継続される。
  after(async () => {
    try {
      const outcome = await runTranslation(contentId, article, () =>
        client.getListDetail<News>({ endpoint: 'news', contentId }),
      );
      await maybeScheduleContinuation(outcome, contentId, continuationCount);
    } catch (error) {
      // runTranslation自体は内部でエラーを捕捉して返す設計だが、想定外の例外
      // （reread以外の箇所での例外等）がここまで抜けてきた場合も、
      // [translate-pipeline] translation failed と同じ形式の1行ログを残す
      // （言語は特定できないため lang=- とする）。「生成中」のロックはそのまま
      // 残るため、STALE_GENERATING_MS（10分）経過後の滞留検知、または次回の
      // Webhook・バックフィルスクリプトの再実行で回復できる。
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[translate-pipeline] translation failed lang=- kind=unexpected_error httpStatus=- message=${message}`,
        contentId,
      );
    }
  });

  return NextResponse.json({ status: 'accepted', contentId }, { status: 202 });
}
