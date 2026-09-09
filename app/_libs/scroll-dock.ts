/**
 * PageReadAloud（地球儀 UI・読み上げ UI）の表示位置切り替え用センチネル。
 *
 * 記事詳細ページではヘッダー画像の直後、ニュース一覧ページでは見出しの直後に
 * 0 高さの目印 <div id={SCROLL_DOCK_SENTINEL_ID}> を置く。
 * PageReadAloud 側が IntersectionObserver でこの目印を監視し、画面上端より
 * 上へスクロールされたら「ドック」状態（画面最上部へせり上がる）に切り替える。
 */
export const SCROLL_DOCK_SENTINEL_ID = 'page-read-aloud-dock-sentinel';
