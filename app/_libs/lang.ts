// サイト全体の表示言語。記事ページの ?lang=en と、この Cookie の両方で切り替わる。
// 優先順位: URL の searchParams.lang > lang Cookie > 日本語(既定)
export const LANG_COOKIE = 'lang';

export type Lang = 'ja' | 'en';

export const resolveLang = (value?: string): Lang => (value === 'en' ? 'en' : 'ja');

// クライアント側で表示言語 Cookie を更新する。'ja' は Cookie を削除して既定に戻す。
export const setLangCookie = (lang: Lang) => {
  if (typeof document === 'undefined') {
    return;
  }
  if (lang === 'en') {
    document.cookie = `${LANG_COOKIE}=en;path=/;max-age=31536000;samesite=lax`;
  } else {
    document.cookie = `${LANG_COOKIE}=;path=/;max-age=0;samesite=lax`;
  }
};
