/**
 * 絵文字の検出・除去ロジック（読み上げテキスト変換とハイライトの対応づけで共通利用）。
 *
 * 対象: 絵文字本体（Extended_Pictographic）とその修飾 — 異体字セレクタ(U+FE0F)、
 * スキントーン(Emoji_Modifier)、ZWJ 連結、地域表示記号ペア（国旗）、キーキャップ。
 * 通常の文字・数字・ASCII 記号・日本語の約物（、。「」！？ など）は対象にしない。
 *
 * 注意: 目次生成（buildToc）はこのロジックを通さないので、目次ラベルには絵文字が残る。
 */

// new RegExp(..., flags) に渡す文字列。'u' フラグ前提。
export const EMOJI_SOURCE =
  '\\p{Regional_Indicator}\\p{Regional_Indicator}' + // 国旗（RI ペア）
  '|\\p{Extended_Pictographic}(?:\\uFE0F|\\p{Emoji_Modifier}|\\u200D\\p{Extended_Pictographic}\\uFE0F?)*' + // 絵文字＋修飾＋ZWJ 連結
  '|[#*0-9]\\uFE0F?\\u20E3' + // キーキャップ（1️⃣ など）
  '|[\\u200D\\uFE0F\\u{1F3FB}-\\u{1F3FF}]'; // 単独で残った ZWJ / VS16 / スキントーン

/** 文字列から絵文字を取り除く（前後の空白や通常文字はそのまま）。 */
export const stripEmoji = (text: string): string =>
  text.replace(new RegExp(EMOJI_SOURCE, 'gu'), '');

/** DOM テキストを走査しながら絵文字シーケンスを飛ばすための sticky（y）正規表現。 */
export const createEmojiMatcher = (): RegExp => new RegExp(EMOJI_SOURCE, 'uy');
