// サイト全体で対応する言語の、唯一の定義元（共通言語レジストリ）。
// ここに無い情報（APIキー・認証情報・TTSの音声名など、サーバー側だけで使う秘匿性の
// ある情報）は含めない。ブラウザ（クライアントコンポーネント）からも安全に import できる。
//
// 言語を追加・削除するときは、この LANGUAGES 配列だけを編集すればよい
// （表示言語一覧・地球儀の国旗一覧・UI文言の型・翻訳先言語・翻訳プロンプト・記事の
// 翻訳フィールド・読み上げの言語判定は、すべてここから派生する）。ただし、以下は
// Record<Lang, ...> 等で個別に追加が必要（追加を忘れるとコンパイルエラーになる）。
//  - app/_libs/tts-voices.server.ts の音声名（server-only）
//  - app/_libs/number-words.ts の数詞（0〜9・10〜99の組み立て）
//  - app/_libs/image100-calc-speech.ts の演算子の言い方・コピュラ文の組み立て
//  - app/_components/ContactSection/slots.ts の曜日表記
//  - app/_libs/ui-strings.ts の各UI文言（Localized 型は非 ja を任意にしているため
//    コンパイルエラーにはならないが、利用者に表示される文言なので実際には埋める）
//
// 配列の並び順が、そのまま地球儀（GlobeLanguageSwitcher）の国旗リングの並び順になる。
// 12言語（日本・韓国・中国・ネパール・ロシア・ドイツ・イタリア・フランス・
// スペイン・ブラジル・アメリカ・フィリピン）がその順に並んでいる。
//
// ネパール語（ne）は読み上げだけ他言語と異なる: ne-NP は Google Cloud TTS の
// 従来ボイス（Standard/Neural2/WaveNet/Chirp3-HD）が1件も存在しないため、
// Gemini TTS（Preview）で合成する。分岐は app/_libs/google-tts.ts 側で行う
// （このレジストリからは他言語と同じ speechLangCode='ne-NP' として見える）。

type LanguageEntry = {
  /** サイト内部で使う言語コード。Cookie・?lang=・翻訳フィールド名の元になる */
  code: string;
  /** 地球儀の国旗リング・aria-label 等に出す、その言語自身での言語名 */
  label: string;
  /** public/flags/<flagIcon>.svg（circle-flags 由来の円形SVG。ISO 3166-1 alpha-2 の国コード） */
  flagIcon: string;
  /**
   * microCMS の翻訳フィールド（title_<translationField> / content_<translationField>）
   * に使うサフィックス。原文言語（日本語）は持たない。
   */
  translationField?: string;
  /**
   * 翻訳プロンプトで使う、その言語の日本語での呼び方（例:「ブラジルポルトガル語（pt-BR）」）。
   * ポルトガル語のように「どの地域の言葉か」を明示しないと誤訳しうる言語は、
   * ここで明確にする。翻訳フィールドを持つ言語のみ必要。
   */
  translationNameJa?: string;
  /**
   * 翻訳プロンプトに埋め込む、文体・敬称の指示（日本語、「〜に」で終わる断片）。
   * 翻訳フィールドを持つ言語のみ必要。
   */
  translationInstruction?: string;
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
    translationNameJa: undefined,
    translationInstruction: undefined,
    speechLangCode: 'ja-JP',
    script: 'cjk',
  },
  {
    code: 'ko',
    label: '한국어',
    flagIcon: 'kr',
    translationField: 'ko',
    translationNameJa: '韓国語',
    translationInstruction: '韓国語は自然で丁寧なビジネス韓国語（하십시오体/합니다体ベース）に',
    speechLangCode: 'ko-KR',
    script: 'cjk',
  },
  {
    code: 'zh',
    label: '中文',
    flagIcon: 'cn',
    translationField: 'zh',
    translationNameJa: '中国語（簡体字）',
    translationInstruction: '中国語は自然で丁寧なビジネス中国語（簡体字・大陸標準）に',
    speechLangCode: 'cmn-CN',
    script: 'cjk',
  },
  {
    code: 'ne',
    label: 'नेपाली',
    flagIcon: 'np',
    translationField: 'ne',
    translationNameJa: 'ネパール語',
    translationInstruction: 'ネパール語は自然で丁寧なビジネスネパール語（敬称 तपाईं ベース）に',
    speechLangCode: 'ne-NP',
    script: 'latin',
  },
  {
    code: 'ru',
    label: 'Русский',
    flagIcon: 'ru',
    translationField: 'ru',
    translationNameJa: 'ロシア語',
    translationInstruction: 'ロシア語は自然で丁寧なビジネスロシア語（敬称 вы ベース）に',
    speechLangCode: 'ru-RU',
    script: 'latin',
  },
  {
    code: 'de',
    label: 'Deutsch',
    flagIcon: 'de',
    translationField: 'de',
    translationNameJa: 'ドイツ語',
    translationInstruction: 'ドイツ語は自然で専門的なビジネスドイツ語（丁寧形 Sie ベース）に',
    speechLangCode: 'de-DE',
    script: 'latin',
  },
  {
    code: 'it',
    label: 'Italiano',
    flagIcon: 'it',
    translationField: 'it',
    translationNameJa: 'イタリア語',
    translationInstruction: 'イタリア語は自然で専門的なビジネスイタリア語（敬称 Lei ベース）に',
    speechLangCode: 'it-IT',
    script: 'latin',
  },
  {
    code: 'fr',
    label: 'Français',
    flagIcon: 'fr',
    translationField: 'fr',
    translationNameJa: 'フランス語',
    translationInstruction: 'フランス語は自然で専門的なビジネスフランス語（丁寧形 vous ベース）に',
    speechLangCode: 'fr-FR',
    script: 'latin',
  },
  {
    code: 'es',
    label: 'Español',
    flagIcon: 'es',
    translationField: 'es',
    translationNameJa: 'スペイン語',
    translationInstruction: 'スペイン語は自然で丁寧なビジネススペイン語（丁寧形 usted ベース・欧州スペイン語）に',
    speechLangCode: 'es-ES',
    script: 'latin',
  },
  {
    code: 'pt',
    label: 'Português',
    flagIcon: 'br',
    translationField: 'pt',
    translationNameJa: 'ブラジルポルトガル語（pt-BR）',
    translationInstruction:
      'ポルトガル語は、ポルトガル本国の表現ではなく、自然で丁寧なブラジルのビジネスポルトガル語（二人称 você ベース）に',
    speechLangCode: 'pt-BR',
    script: 'latin',
  },
  {
    code: 'en',
    label: 'English',
    flagIcon: 'us',
    translationField: 'en',
    translationNameJa: '英語',
    translationInstruction: '英語は自然で専門的なビジネス英語に',
    speechLangCode: 'en-US',
    script: 'latin',
  },
  {
    code: 'fil',
    label: 'Filipino',
    flagIcon: 'ph',
    translationField: 'fil',
    translationNameJa: 'フィリピノ語',
    translationInstruction: 'フィリピノ語は自然で丁寧なビジネスフィリピノ語（敬称 po/opo を交えた丁寧表現ベース）に',
    speechLangCode: 'fil-PH',
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
export const getLanguage = (lang: Lang): (typeof LANGUAGES)[number] => BY_CODE.get(lang) ?? LANGUAGES[0];

const BY_TRANSLATION_FIELD = new Map(
  LANGUAGES.filter((l) => l.translationField).map((l) => [l.translationField as TranslationSuffix, l]),
);

/** 翻訳フィールドのサフィックスから言語登録情報を引く（Anthropic 翻訳プロンプトの組み立て用） */
export const getLanguageByTranslationField = (
  suffix: TranslationSuffix,
): (typeof LANGUAGES)[number] => {
  const found = BY_TRANSLATION_FIELD.get(suffix);
  if (!found) throw new Error(`Unknown translation field: ${suffix}`);
  return found;
};

const CJK_LANGS: ReadonlySet<Lang> = new Set(LANGUAGES.filter((l) => l.script === 'cjk').map((l) => l.code));

/** ディクテーション区切り判定用: 分かち書きが無い言語（日本語・韓国語・中国語）か */
export const isCjkLang = (lang: Lang): boolean => CJK_LANGS.has(lang);
