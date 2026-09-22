import { type Lang } from './lang';
import { extendedNumberWord } from './number-words';

export type Operator = 'add' | 'sub' | 'mul' | 'div';

// 演算子ごとの、自然な接続語（8言語）。セルクリック時の読み上げ文の組み立てと、
// セルの aria-label（「2かける8を再生」等）の両方から参照する共通の単語表。
export const OPERATOR_WORD: Record<Operator, Record<Lang, string>> = {
  add: { ja: 'たす', en: 'plus', ko: '더하기', zh: '加', de: 'plus', fr: 'plus', es: 'más', ru: 'плюс' },
  sub: { ja: 'ひく', en: 'minus', ko: '빼기', zh: '减', de: 'minus', fr: 'moins', es: 'menos', ru: 'минус' },
  mul: { ja: 'かける', en: 'times', ko: '곱하기', zh: '乘', de: 'mal', fr: 'fois', es: 'por', ru: 'умножить на' },
  div: { ja: 'わる', en: 'divided by', ko: '나누기', zh: '除以', de: 'geteilt durch', fr: 'divisé par', es: 'dividido entre', ru: 'разделить на' },
};

const MINUS_WORD: Record<Lang, string> = {
  ja: 'マイナス',
  en: 'minus',
  ko: '마이너스',
  zh: '负',
  de: 'minus',
  fr: 'moins',
  es: 'menos',
  ru: 'минус',
};

// マイナスの符号を、直前の数詞にくっつけて書く言語（間に空白を置かない）
const NO_SPACE_BEFORE_MAGNITUDE: Partial<Record<Lang, true>> = { ja: true, zh: true };

// 引き算の答え（横 − 縦）は 0〜9 のマイナスにしかならない（最大 9-0=9, 最小 0-9=-9）ため、
// 絶対値は常に既存の NUMBER_WORDS（0〜9）だけで表せる。
const formatAnswerWord = (value: number, lang: Lang): string => {
  if (value >= 0) return extendedNumberWord(value, lang);
  const magnitude = extendedNumberWord(Math.abs(value), lang);
  const minus = MINUS_WORD[lang];
  return NO_SPACE_BEFORE_MAGNITUDE[lang] ? `${minus}${magnitude}` : `${minus} ${magnitude}`;
};

// 韓国語だけ、答えを導く助詞（은/는）が直前の数詞（＝縦の数字 v, 0〜9固定）の
// 末尾がパッチム（子音終わり）かどうかで変わる（例: 팔은／오는）。0〜9 の10通りだけ
// なので、あらかじめ決め打ちする（一般的なパッチム判定ロジックより確実）。
const KO_TOPIC_PARTICLE = ['은', '은', '는', '은', '는', '는', '은', '은', '은', '는'];

// 「h 演算子 v は/is 答え」の、コピュラ文を組み立てる（足し算・引き算・かけ算・
// 割り切れる割り算で共通の形）。
const buildCopulaSentence = (hWord: string, opWord: string, vWord: string, answerWord: string, lang: Lang, vDigit: number): string => {
  switch (lang) {
    case 'ja':
      return `${hWord}${opWord}${vWord}は${answerWord}`;
    case 'zh':
      return `${hWord}${opWord}${vWord}等于${answerWord}`;
    case 'ko': {
      const particle = KO_TOPIC_PARTICLE[vDigit] ?? '는';
      return `${hWord} ${opWord} ${vWord}${particle} ${answerWord}`;
    }
    case 'de':
      return `${hWord} ${opWord} ${vWord} ist ${answerWord}`;
    case 'fr':
      return `${hWord} ${opWord} ${vWord} égale ${answerWord}`;
    case 'es':
      return `${hWord} ${opWord} ${vWord} es ${answerWord}`;
    case 'ru':
      return `${hWord} ${opWord} ${vWord} равно ${answerWord}`;
    case 'en':
    default:
      return `${hWord} ${opWord} ${vWord} is ${answerWord}`;
  }
};

// 割り算で、あまりが出る場合。商のコピュラ文の後ろに「あまり◯」を続ける。
const buildDivisionWithRemainder = (
  hWord: string,
  opWord: string,
  vWord: string,
  quotientWord: string,
  remainderWord: string,
  lang: Lang,
  vDigit: number,
): string => {
  const base = buildCopulaSentence(hWord, opWord, vWord, quotientWord, lang, vDigit);
  switch (lang) {
    case 'ja':
      return `${base}あまり${remainderWord}`;
    case 'zh':
      return `${base}，余${remainderWord}`;
    case 'ko':
      return `${base}, 나머지는 ${remainderWord}`;
    case 'de':
      return `${base}, Rest ${remainderWord}`;
    case 'fr':
      return `${base}, reste ${remainderWord}`;
    case 'es':
      return `${base}, resto ${remainderWord}`;
    case 'ru':
      return `${base}, остаток ${remainderWord}`;
    case 'en':
    default:
      return `${base}, remainder ${remainderWord}`;
  }
};

// 0で割る場合。「答えが存在しない」ことを、各言語で自然な表現で伝える。
const buildNoAnswer = (hWord: string, opWord: string, vWord: string, lang: Lang): string => {
  switch (lang) {
    case 'ja':
      return `${hWord}${opWord}${vWord}に、答えはありません`;
    case 'zh':
      return `${hWord}${opWord}${vWord}没有答案`;
    case 'ko':
      return `${hWord} ${opWord} ${vWord}은 답이 없습니다`;
    case 'de':
      return `${hWord} ${opWord} ${vWord} hat keine Lösung`;
    case 'fr':
      return `${hWord} ${opWord} ${vWord} n'a pas de solution`;
    case 'es':
      return `${hWord} ${opWord} ${vWord} no tiene solución`;
    case 'ru':
      return `${hWord} ${opWord} ${vWord} не имеет решения`;
    case 'en':
    default:
      return `${hWord} ${opWord} ${vWord} has no answer`;
  }
};

/**
 * 横の見出し h・縦の見出し v（ともに 0〜9）・演算子から、/api/tts に渡す
 * 読み上げ文を、言語ごとの自然な言い方で組み立てる。
 * 引き算は「横 − 縦」、割り算は「横 ÷ 縦」で統一する（この順で固定。呼び出し側もこれに合わせること）。
 *
 * 割り算は3パターン：
 * 1. 縦(v) が 0 → 常に「答えが存在しない」（横の値に関わらず）
 * 2. 横(h) が 縦(v) で割り切れる → 通常のコピュラ文（0を割る場合＝商0もここに含む）
 * 3. 割り切れない → 商のコピュラ文の後ろに「あまり◯」を続ける
 */
export const buildCalcSpeechText = (h: number, v: number, operator: Operator, lang: Lang): string => {
  const hWord = extendedNumberWord(h, lang);
  const vWord = extendedNumberWord(v, lang);
  const opWord = OPERATOR_WORD[operator][lang];

  if (operator === 'div') {
    if (v === 0) return buildNoAnswer(hWord, opWord, vWord, lang);
    const quotient = Math.floor(h / v);
    const remainder = h % v;
    if (remainder === 0) {
      return buildCopulaSentence(hWord, opWord, vWord, extendedNumberWord(quotient, lang), lang, v);
    }
    return buildDivisionWithRemainder(
      hWord,
      opWord,
      vWord,
      extendedNumberWord(quotient, lang),
      extendedNumberWord(remainder, lang),
      lang,
      v,
    );
  }

  const answerValue = operator === 'add' ? h + v : operator === 'sub' ? h - v : h * v;
  const answerWord = formatAnswerWord(answerValue, lang);
  return buildCopulaSentence(hWord, opWord, vWord, answerWord, lang, v);
};
