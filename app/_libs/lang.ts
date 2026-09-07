// サイト全体の表示言語。記事ページの ?lang= と、この Cookie の両方で切り替わる。
// 優先順位: URL の searchParams.lang > lang Cookie > 日本語(既定)
export const LANG_COOKIE = 'lang';

export type Lang = 'ja' | 'en' | 'ko' | 'zh' | 'de' | 'fr' | 'es';

// 明示的に対応している言語のみ受け付け、それ以外は日本語にフォールバックする。
export const SUPPORTED_LANGS: Lang[] = ['ja', 'en', 'ko', 'zh', 'de', 'fr', 'es'];

export const resolveLang = (value?: string): Lang =>
  value && (SUPPORTED_LANGS as string[]).includes(value) ? (value as Lang) : 'ja';

// クライアント側で表示言語 Cookie を更新する。'ja' は Cookie を削除して既定に戻す。
export const setLangCookie = (lang: Lang) => {
  if (typeof document === 'undefined') {
    return;
  }
  if (lang !== 'ja') {
    document.cookie = `${LANG_COOKIE}=${lang};path=/;max-age=31536000;samesite=lax`;
  } else {
    document.cookie = `${LANG_COOKIE}=;path=/;max-age=0;samesite=lax`;
  }
};
