import { type Lang } from './lang';
import { extendedNumberWord } from './number-words';

export type Operator = 'add' | 'sub' | 'mul';

// 演算子ごとの、自然な接続語（8言語）。セルクリック時の読み上げ文の組み立てと、
// セルの aria-label（「2かける8を再生」等）の両方から参照する共通の単語表。
export const OPERATOR_WORD: Record<Operator, Record<Lang, string>> = {
  add: { ja: 'たす', en: 'plus', ko: '더하기', zh: '加', de: 'plus', fr: 'plus', es: 'más', ru: 'плюс' },
  sub: { ja: 'ひく', en: 'minus', ko: '빼기', zh: '减', de: 'minus', fr: 'moins', es: 'menos', ru: 'минус' },
  mul: { ja: 'かける', en: 'times', ko: '곱하기', zh: '乘', de: 'mal', fr: 'fois', es: 'por', ru: 'умножить на' },
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

/**
 * 横の見出し h・縦の見出し v（ともに 0〜9）・演算子から、/api/tts に渡す
 * 読み上げ文を、言語ごとの自然な言い方で組み立てる。
 * 引き算は「横 − 縦」で統一する（この順で固定。呼び出し側もこれに合わせること）。
 */
export const buildCalcSpeechText = (h: number, v: number, operator: Operator, lang: Lang): string => {
  const hWord = extendedNumberWord(h, lang);
  const vWord = extendedNumberWord(v, lang);
  const answerValue = operator === 'add' ? h + v : operator === 'sub' ? h - v : h * v;
  const answerWord = formatAnswerWord(answerValue, lang);
  const opWord = OPERATOR_WORD[operator][lang];

  switch (lang) {
    case 'ja':
      return `${hWord}${opWord}${vWord}は${answerWord}`;
    case 'zh':
      return `${hWord}${opWord}${vWord}等于${answerWord}`;
    case 'ko': {
      const particle = KO_TOPIC_PARTICLE[v] ?? '는';
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
