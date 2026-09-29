import crypto from 'node:crypto';

// /api/translate-article の認証・自己継続に関する純粋なロジックをまとめたモジュール。
// Next.jsのRoute Handler（app/api/translate-article/route.ts）は、GET/POST/maxDuration
// など決められた名前しかexportできない制約があるため、ローカルでモックテストする
// ために単体でimportできるロジックはこちらに切り出している。

export const CONTINUATION_HEADER = 'x-translate-continuation';

// 自己継続の呼び出し回数の上限。無限ループ防止のため。
export const MAX_CONTINUATIONS = 6;

/**
 * Webhook（およびその自己継続リクエスト）の認証。TRANSLATE_WEBHOOK_SECRET が
 * 未設定の場合はfail-closed（誰も呼び出せない状態）にする。
 *
 * 継続リクエスト（x-translate-continuation ヘッダー付き）も含め、すべてのリクエストが
 * この関数を通る。継続ヘッダーは「生成中」ロックのバイパス可否だけに使われ、
 * 認証そのものをバイパスする経路は存在しない。
 */
export const isAuthorized = (request: { headers: Pick<Headers, 'get'> }): boolean => {
  const expected = process.env.TRANSLATE_WEBHOOK_SECRET;
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

export const getContinuationCount = (request: { headers: Pick<Headers, 'get'> }): number => {
  const raw = request.headers.get(CONTINUATION_HEADER);
  const parsed = raw ? Number(raw) : 0;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

/**
 * 今回の結果を踏まえて、自分自身に続きの処理を依頼するリクエストを送るべきかを
 * 判定する（未翻訳の言語が残っている、またはエラーが起きた場合で、かつ継続回数が
 * 上限未満のときだけ true）。
 */
export const shouldScheduleContinuation = (
  outcomeStatus: 'skipped' | 'error' | 'ok' | 'partial',
  continuationCount: number,
): boolean => (outcomeStatus === 'partial' || outcomeStatus === 'error') && continuationCount < MAX_CONTINUATIONS;
