import { resolveLang, type Lang } from './lang';

// UI 文言の多言語辞書。
// 記事翻訳と同様、まずは ja / en のみ用意する。
// en が無いキー・未対応言語はすべて ja にフォールバックする。
// 文言を増やす場合はここにキーを追加するだけでよい（Business 見出しなど今後拡張予定）。
type Localized = {
  ja: string;
  en?: string;
};

const UI_STRINGS = {
  heroSpeech: {
    ja: '世界を手玉にとるわよ！',
    en: "I'll take the whole world in my hands!",
  },
} satisfies Record<string, Localized>;

export type UiStringKey = keyof typeof UI_STRINGS;

// 指定キーの文言を lang に応じて返す。lang は Cookie / searchParams で解決済みの値を渡す。
export const ui = (key: UiStringKey, lang: Lang | string | undefined): string => {
  const entry = UI_STRINGS[key];
  return (resolveLang(lang) === 'en' && entry.en) || entry.ja;
};
