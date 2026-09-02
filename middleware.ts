import { NextResponse } from 'next/server';

// /news/*・/business・/members はヘッダー/フッターや本文が lang Cookie で
// 切り替わる（＝リクエストごとにパーソナライズされる）ため、CDN の公開ISR
// キャッシュを行わない。
//
// もともとこの middleware は上記ルートに
//   CDN-Cache-Control: public, s-maxage=60, stale-while-revalidate=300
// を付けて 60 秒 CDN キャッシュしていたが、Vercel の CDN はキャッシュキーに
// Cookie を含めないため、日本語で温まったレスポンスが「地球儀UIで英語に
// 切り替えた（lang Cookie を持つ）」利用者にもそのまま返っていた。
// これらのページは元々リクエストごとに動的レンダリングされているので、
// CDN キャッシュを外しても失うのは 60 秒の追加キャッシュ層のみ。
export function middleware() {
  const response = NextResponse.next();
  response.headers.set('CDN-Cache-Control', 'no-store, must-revalidate');
  return response;
}

export const config = {
  matcher: ['/news/:path*', '/business', '/members'],
};
