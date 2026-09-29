import 'server-only';
import { LANGUAGES, type Lang } from './lang-registry';

// Google Cloud Text-to-Speech の音声名（サーバー側だけで使う）。
// `server-only` を import しているため、誤ってクライアントコンポーネントから
// import した場合はビルドエラーになる（クライアントのバンドルには含まれない）。
//
// voices API（GET .../v1/voices?languageCode=xx-XX）で name と ssmlGender=FEMALE を
// 実機確認したうえで指定している。
//  - ja-JP-Neural2-B  … 落ち着いた女性。ニュース読み上げに向く
//  - en-US-Neural2-F  … 明瞭で自然な女性
//  - ko-KR-Neural2-A  … 標準的で聞き取りやすい女性
//  - cmn-CN-Wavenet-A … 大陸標準（簡体字）の女性。cmn-CN に Neural2 は無いため WaveNet
//  - de-DE-Neural2-G  … ドイツ語の女性。de-DE の Neural2 女性はこの1種のみ
//  - fr-FR-Neural2-F  … フランス語の女性。fr-FR の Neural2 女性はこの1種のみ（-G は男性）
//  - es-ES-Neural2-A  … スペイン語（欧州）の女性。es-ES の Neural2 女性は -A / -E / -H
//  - ru-RU-Wavenet-A … ロシア語の女性。ru-RU に Neural2 は無いため WaveNet
//    （女性 WaveNet は -A / -C / -E。-B / -D は男性）
//  - it-IT-Neural2-A … イタリア語の女性。voices API で実在・FEMALE を確認済み
//  - pt-BR-Neural2-A … ブラジルポルトガル語の女性。voices API で実在・FEMALE を
//    確認済み（pt-PT ではなく pt-BR。ポルトガル本国の音声とは別物）
//  - fil-ph-Neural2-A … フィリピノ語の女性。voices API で実在・FEMALE を確認済み。
//    Google側の命名ゆれで、Standard/Wavenetは"fil-PH-"（大文字PH）だが、Neural2だけ
//    "fil-ph-"（小文字ph）である点に注意（voices APIのレスポンスをそのまま使うこと。
//    大文字化した "fil-PH-Neural2-A" は存在しない）。合成APIのvoice.languageCode
//    （フィールド側は 'fil-PH'）とvoice.nameの大文字小文字が食い違っても、実機確認では
//    正常に合成できた。
//    （存在しない name を渡すと Google 側が別ボイス（男性含む）にフォールバック
//     または 400 を返す。追加時は必ず voices API で実在と性別を確認すること）
//  - Kore（ne, Gemini TTS）… ne-NP は Standard/Neural2/WaveNet/Chirp3-HD のいずれにも
//    音声が1件も存在しない（voices API で languageCode=ne-NP が空配列を返すことを確認済み）。
//    Gemini TTS（Preview、モデル名は下記 GEMINI_TTS_MODEL）だけが ne-NP を話せる。
//    Gemini TTS は Vertex AI 経由で動くため、サービスアカウントに
//    roles/aiplatform.user（Agent Platform ユーザー、旧 Vertex AI ユーザー）が
//    必要（無いと 403 aiplatform.endpoints.predict で失敗する）。
//    実機確認（2026-09-29）: languageCode=ne-NP, voice.name=Kore, modelName=
//    gemini-2.5-flash-tts, input.prompt="Read the text naturally in Nepali."
//    で合成成功。音声の長さがテキスト量に比例し（無音・固定長フォールバックでない）、
//    ピッチが時間とともに変化する（発話特有の抑揚があり、無音・ノイズでない）ことを
//    確認済み。
//
// Record<Lang, string> のため、LANGUAGES に言語を追加してもここに音声名を
// 追加し忘れるとコンパイルエラーになる。
const VOICE_NAME: Record<Lang, string> = {
  ja: 'ja-JP-Neural2-B',
  en: 'en-US-Neural2-F',
  ko: 'ko-KR-Neural2-A',
  zh: 'cmn-CN-Wavenet-A',
  ne: 'Kore',
  de: 'de-DE-Neural2-G',
  fr: 'fr-FR-Neural2-F',
  es: 'es-ES-Neural2-A',
  ru: 'ru-RU-Wavenet-A',
  it: 'it-IT-Neural2-A',
  pt: 'pt-BR-Neural2-A',
  fil: 'fil-ph-Neural2-A',
};

// Gemini TTS（Preview）のモデル名。ne 以外の言語は Standard/Neural2/WaveNet の
// 通常合成のままなので、ここで使うのは ne だけ（将来 Gemini TTS でしか話せない
// 言語が増えたら GEMINI_TTS_PROMPT に追加する）。
const GEMINI_TTS_MODEL = 'gemini-2.5-flash-tts';

// Gemini TTS を使う言語だけが持つ、input.prompt に渡す話し方の指示（英語）。
// このキーが存在する言語だけ、google-tts.ts が Gemini TTS 用のリクエスト形式
// （v1beta1 + voice.modelName + input.prompt）に切り替える。
const GEMINI_TTS_PROMPT: Partial<Record<Lang, string>> = {
  ne: 'Read the text naturally in Nepali.',
};

export type VoiceInfo = {
  languageCode: string;
  name: string;
  /** 設定されている言語だけ、Gemini TTS（v1beta1 + modelName）で合成する */
  geminiModelName?: string;
  /** Gemini TTS 使用時のみ。input.prompt に渡す話し方の指示 */
  geminiPrompt?: string;
};

// 言語コード（レジストリの speechLangCode）と音声名（上記、server-only）を合わせた、
// 表示言語ごとの自然な女性ボイス。
export const VOICE_BY_LANG: Record<Lang, VoiceInfo> = Object.fromEntries(
  LANGUAGES.map((l) => {
    const lang = l.code as Lang;
    const geminiPrompt = GEMINI_TTS_PROMPT[lang];
    return [
      lang,
      {
        languageCode: l.speechLangCode,
        name: VOICE_NAME[lang],
        ...(geminiPrompt ? { geminiModelName: GEMINI_TTS_MODEL, geminiPrompt } : {}),
      },
    ];
  }),
) as Record<Lang, VoiceInfo>;
