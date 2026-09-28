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
//    （存在しない name を渡すと Google 側が別ボイス（男性含む）にフォールバック
//     または 400 を返す。追加時は必ず voices API で実在と性別を確認すること）
//
// Record<Lang, string> のため、LANGUAGES に言語を追加してもここに音声名を
// 追加し忘れるとコンパイルエラーになる。
const VOICE_NAME: Record<Lang, string> = {
  ja: 'ja-JP-Neural2-B',
  en: 'en-US-Neural2-F',
  ko: 'ko-KR-Neural2-A',
  zh: 'cmn-CN-Wavenet-A',
  de: 'de-DE-Neural2-G',
  fr: 'fr-FR-Neural2-F',
  es: 'es-ES-Neural2-A',
  ru: 'ru-RU-Wavenet-A',
};

// 言語コード（レジストリの speechLangCode）と音声名（上記、server-only）を合わせた、
// 表示言語ごとの自然な女性ボイス。
export const VOICE_BY_LANG: Record<Lang, { languageCode: string; name: string }> =
  Object.fromEntries(
    LANGUAGES.map((l) => [
      l.code,
      { languageCode: l.speechLangCode, name: VOICE_NAME[l.code as Lang] },
    ]),
  ) as Record<Lang, { languageCode: string; name: string }>;
