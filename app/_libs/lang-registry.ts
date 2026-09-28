// サイト全体で対応する言語の、唯一の定義元（共通言語レジストリ）。
// ここに無い情報（APIキー・認証情報・TTSの音声名など、サーバー側だけで使う秘匿性の
// ある情報）は含めない。ブラウザ（クライアントコンポーネント）からも安全に import できる。
//
// 言語を追加・削除するときは、この LANGUAGES 配列だけを編集すればよい
// （表示言語一覧・地球儀の国旗一覧・UI文言の型・翻訳先言語・記事の翻訳フィールド・
// 読み上げの言語判定は、すべてここから派生する）。ただし、追加する言語の音声名は
// 別途 app/_libs/tts-voices.server.ts 側にも追加する必要がある（Record<Lang, ...> の
// ため、追加を忘れるとコンパイルエラーになる）。
//
// 配列の並び順が、そのまま地球儀（GlobeLanguageSwitcher）の国旗リングの並び順になる。

type LanguageEntry = {
  /** サイト内部で使う言語コード。Cookie・?lang=・翻訳フィールド名の元になる */
  code: string;
  /** 地球儀の国旗リング・aria-label 等に出す、その言語自身での言語名 */
  label: string;
  /** public/flags/<flagIcon>.svg（circle-flags 由来の円形SVG。ISO 3166-1 alpha-2 の国コード） */
  flagIcon: string;
  /**
   * microCMS の翻訳フィールド（title_<translationField> / content_<translationField>）
   * および Anthropic API への翻訳依頼に使う言語コード。原文言語（日本語）は持たない。
   */
  translationField?: string;
  /** 読み上げ（Google Cloud TTS）の BCP-47 言語コード。音声名（server-only）とは別 */
  speechLangCode: string;
  /** ディクテーション練習モードの区切り判定（分かち書きが無い言語は 'cjk'） */
  script: 'latin' | 'cjk';
};

export const LANGUAGES = [
  {
    code: 'ja',
    label: '日本語',
    flagIcon: 'jp',
    translationField: undefined,
    speechLangCode: 'ja-JP',
    script: 'cjk',
  },
  {
    code: 'en',
    label: 'English',
    flagIcon: 'us',
    translationField: 'en',
    speechLangCode: 'en-US',
    script: 'latin',
  },
  {
    code: 'ko',
    label: '한국어',
    flagIcon: 'kr',
    translationField: 'ko',
    speechLangCode: 'ko-KR',
    script: 'cjk',
  },
  {
    code: 'zh',
    label: '中文',
    flagIcon: 'cn',
    translationField: 'zh',
    speechLangCode: 'cmn-CN',
    script: 'cjk',
  },
  {
    code: 'de',
    label: 'Deutsch',
    flagIcon: 'de',
    translationField: 'de',
    speechLangCode: 'de-DE',
    script: 'latin',
  },
  {
    code: 'fr',
    label: 'Français',
    flagIcon: 'fr',
    translationField: 'fr',
    speechLangCode: 'fr-FR',
    script: 'latin',
  },
  {
    code: 'es',
    label: 'Español',
    flagIcon: 'es',
    translationField: 'es',
    speechLangCode: 'es-ES',
    script: 'latin',
  },
  {
    code: 'ru',
    label: 'Русский',
    flagIcon: 'ru',
    translationField: 'ru',
    speechLangCode: 'ru-RU',
    script: 'latin',
  },
] as const satisfies readonly LanguageEntry[];

/** サイトが対応する言語コード。この型を変えるには LANGUAGES 配列を編集する */
export type Lang = (typeof LANGUAGES)[number]['code'];

/** 翻訳フィールドを持つ言語（= 原文の日本語を除く全言語）のフィールドサフィックス */
export type TranslationSuffix = Exclude<(typeof LANGUAGES)[number]['translationField'], undefined>;

export const SUPPORTED_LANGS: Lang[] = LANGUAGES.map((l) => l.code);

/** 翻訳（Anthropic API・microCMS の title_ / content_ フィールド）の対象言語 */
export const TRANSLATION_TARGET_LANGS: TranslationSuffix[] = LANGUAGES.flatMap((l) =>
  l.translationField ? [l.translationField] : [],
);

const BY_CODE = new Map(LANGUAGES.map((l) => [l.code as Lang, l]));

/** 指定言語の登録情報。Lang 型で渡す限り必ず見つかる */
export const getLanguage = (lang: Lang): (typeof LANGUAGES)[number] =>
  BY_CODE.get(lang) ?? LANGUAGES[0];

const CJK_LANGS: ReadonlySet<Lang> = new Set(
  LANGUAGES.filter((l) => l.script === 'cjk').map((l) => l.code),
);

/** ディクテーション区切り判定用: 分かち書きが無い言語（日本語・韓国語・中国語）か */
export const isCjkLang = (lang: Lang): boolean => CJK_LANGS.has(lang);
