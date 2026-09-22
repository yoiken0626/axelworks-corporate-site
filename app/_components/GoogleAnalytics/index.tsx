'use client';

import { Suspense, useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * Next.js のクライアント側遷移（History API によるルート変更。フルリロードなし）では
 * gtag.js が自動でページビューを検知しないため、経路（パス + クエリ）が変わるたびに
 * 手動で page_view イベントを送る。
 *
 * 初回のページロードぶんは、app/layout.tsx に埋め込んだ gtag('config', ...) が
 * 既に記録している（gtag('config', ...) は既定で最初の page_view を自動送信する）ため、
 * ここでは「2回目以降の、実際の経路の変化」のときだけ送信する（初回マウント時は
 * isFirstRenderRef で必ずスキップする）。
 *
 * 言語切り替え（GlobeLanguageSwitcher の router.refresh()）はパス・クエリを変えない
 * ため、依存配列（pathname / search の文字列）が変化せず、重複送信は起きない
 * （report参照）。
 */
function PageViewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // searchParams はオブジェクト参照が再レンダーのたびに変わりうるため、文字列化してから
  // 依存配列に入れる（内容が同じなら effect を再実行させない）。
  const search = searchParams.toString();
  const isFirstRenderRef = useRef(true);
  // 直近に送信した page_title。document.title がこの値からまだ変わっていなければ
  // 「Next.js側のタイトル反映がまだ終わっていない」とみなし、少し待つ判断に使う。
  const lastTitleRef = useRef<string>('');

  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      lastTitleRef.current = typeof document !== 'undefined' ? document.title : '';
      return;
    }
    if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;

    const pagePath = search ? `${pathname}?${search}` : pathname;
    let cancelled = false;
    // document.title（Next.jsのメタデータ由来）の反映が、このeffectの実行より
    // 後になることがある（クライアント側遷移の直後は特に）。前回送信時の
    // タイトルから変わるまで、最大 2 秒ほど短い間隔でポーリングして待つ。
    // それでも変わらなければ、そのときの値でそのまま送る（送信自体は諦めない）。
    const MAX_ATTEMPTS = 40;
    const POLL_MS = 50;
    let attempts = 0;
    const trySend = () => {
      if (cancelled) return;
      attempts += 1;
      const currentTitle = document.title;
      // Next.js はルート遷移の途中で、一瞬 document.title を空文字にしてから
      // 新しいタイトルを設定する。この空文字の瞬間を「まだタイトルが確定していない」
      // として扱い、（前回と同じ場合と合わせて）待ち続ける。
      const notReadyYet = currentTitle === '' || currentTitle === lastTitleRef.current;
      if (notReadyYet && attempts < MAX_ATTEMPTS) {
        window.setTimeout(trySend, POLL_MS);
        return;
      }
      lastTitleRef.current = currentTitle;
      window.gtag?.('event', 'page_view', {
        page_path: pagePath,
        page_location: window.location.href,
        page_title: currentTitle,
      });
    };
    trySend();
    return () => {
      cancelled = true;
    };
  }, [pathname, search]);

  return null;
}

/**
 * NEXT_PUBLIC_GA_ID が未設定の環境（開発中など）では何もしない（エラーにしない）。
 * useSearchParams() は Suspense 境界が必要という Next.js の制約に合わせ、
 * 実処理は内側の PageViewTracker に切り出している。
 */
export default function GoogleAnalytics() {
  if (!process.env.NEXT_PUBLIC_GA_ID) return null;
  return (
    <Suspense fallback={null}>
      <PageViewTracker />
    </Suspense>
  );
}
