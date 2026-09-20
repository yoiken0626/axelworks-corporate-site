// 1ページのニュース表示件数
export const NEWS_LIST_LIMIT = 10;

// トップページの初回表示件数（4列グリッドで4行＝16件）
export const TOP_NEWS_LIMIT = 16;

// トップページ「もっと見る」で追加取得する件数
export const LOAD_MORE_COUNT = 16;

// 記事本文中の「リンクだけの段落」をOGPカードに変換する対象ホスト（完全一致）
export const LINK_CARD_ALLOWED_HOSTS = ['note.com', 'axel-works.com', 'www.axel-works.com'];

// /saas ページで案内するデモサイト（noter-report）の情報。
// 参照専用の公開デモ環境の認証情報のみを置く（本番の認証情報はここに置かない）。
export const SAAS_DEMO = {
  url: 'https://noter-report.vercel.app',
  loginId: 'noter',
  password: 'Follower',
} as const;
