// サイト全体の表示言語。記事ページの ?lang= と、この Cookie の両方で切り替わる。
// 優先順位: URL の searchParams.lang > lang Cookie > 日本語(既定)
//
// 言語の定義（コード・表示名・国旗・翻訳フィールド・読み上げ言語コード等）は
// app/_libs/lang-registry.ts に集約されている。このファイルは、その登録情報を
// 使う既存の呼び出し元（`from '@/app/_libs/lang'`）に向けた、Cookie/URL 解決込みの
// 窓口として残している。
export {
  LANGUAGES,
  SUPPORTED_LANGS,
  TRANSLATION_TARGET_LANGS,
  getLanguage,
  isCjkLang,
  type Lang,
  type TranslationSuffix,
} from './lang-registry';
import { SUPPORTED_LANGS, type Lang } from './lang-registry';

export const LANG_COOKIE = 'lang';

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
