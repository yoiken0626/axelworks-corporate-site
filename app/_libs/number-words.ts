import { type Lang } from './lang';

/**
 * /image100（イメージ100計算）の、表の見出しに添える「0〜9の訳語」の対応表。
 * 読み上げ音声そのものは算用数字（例: "5"）をそのまま /api/tts に渡せば各言語の
 * TTS が正しく発音するため、ここは表示専用（数字の下に添える訳語）。
 * index = 数字そのもの（index 0 = 0, index 9 = 9）。
 */
export const NUMBER_WORDS: Record<Lang, string[]> = {
  ja: ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'],
  en: ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'],
  ko: ['영', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'],
  zh: ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'],
  de: ['null', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun'],
  fr: ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf'],
  es: ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'],
  ru: ['ноль', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'],
};

/** digit は 0〜9。範囲外は空文字を返す。 */
export const numberWord = (digit: number, lang: Lang): string => {
  if (digit < 0 || digit > 9) return '';
  return NUMBER_WORDS[lang][digit] ?? '';
};

// ============================================================================
// 11以上の、単語での読み方（/image100 のセルクリック読み上げ専用。かけ算の答え
// は最大 9×9=81 まであるため必要）。上の NUMBER_WORDS（0〜9）を土台に、各言語の
// 自然な数の作り方（十進の合成規則）で組み立てる。0〜99 まで対応（実際に使うのは
// 0〜81）。範囲外・非整数は算用数字の文字列にフォールバックする。
// ============================================================================

// 日本語・中国語・韓国語（漢数字／数詞）は「10の位＋一の位」を並べるだけの、
// 共通した合成規則（例: 16 = 十 + 六、81 = 八 + 十 + 一）。
const sinoStyle = (n: number, ones: string[], ten: string): string => {
  if (n < 10) return ones[n];
  const tensDigit = Math.floor(n / 10);
  const units = n % 10;
  if (n < 20) return ten + (units ? ones[units] : '');
  return (tensDigit >= 2 ? ones[tensDigit] : '') + ten + (units ? ones[units] : '');
};

const EN_ONES = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
];
const EN_TENS: Record<number, string> = {
  2: 'twenty', 3: 'thirty', 4: 'forty', 5: 'fifty', 6: 'sixty', 7: 'seventy', 8: 'eighty', 9: 'ninety',
};
const en = (n: number): string => {
  if (n < 20) return EN_ONES[n];
  const tens = Math.floor(n / 10);
  const units = n % 10;
  return EN_TENS[tens] + (units ? `-${EN_ONES[units]}` : '');
};

const DE_TEENS = [
  'zehn', 'elf', 'zwölf', 'dreizehn', 'vierzehn', 'fünfzehn', 'sechzehn', 'siebzehn', 'achtzehn', 'neunzehn',
];
const DE_TENS: Record<number, string> = {
  2: 'zwanzig', 3: 'dreißig', 4: 'vierzig', 5: 'fünfzig', 6: 'sechzig', 7: 'siebzig', 8: 'achtzig', 9: 'neunzig',
};
// 合成（21等）のときだけ eins → ein になる（独立した「1」= eins とは別扱い）
const DE_ONES_COMPOUND: Record<number, string> = {
  1: 'ein', 2: 'zwei', 3: 'drei', 4: 'vier', 5: 'fünf', 6: 'sechs', 7: 'sieben', 8: 'acht', 9: 'neun',
};
const de = (n: number, ones: string[]): string => {
  if (n < 10) return ones[n];
  if (n < 20) return DE_TEENS[n - 10];
  const tens = Math.floor(n / 10);
  const units = n % 10;
  if (units === 0) return DE_TENS[tens];
  return `${DE_ONES_COMPOUND[units]}und${DE_TENS[tens]}`;
};

const FR_TEENS = [
  'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf',
];
const FR_TENS_20_60: Record<number, string> = {
  2: 'vingt', 3: 'trente', 4: 'quarante', 5: 'cinquante', 6: 'soixante',
};
// フランス語は 70〜99 が二十進法混じりの不規則な作り方になる
// （70=soixante-dix、80=quatre-vingts、90=quatre-vingt-dix）。
const fr = (n: number, ones: string[]): string => {
  if (n < 10) return ones[n];
  if (n < 20) return FR_TEENS[n - 10];
  const tens = Math.floor(n / 10);
  const units = n % 10;
  if (tens >= 2 && tens <= 6) {
    if (units === 0) return FR_TENS_20_60[tens];
    if (units === 1) return `${FR_TENS_20_60[tens]}-et-un`;
    return `${FR_TENS_20_60[tens]}-${ones[units]}`;
  }
  if (tens === 7) {
    if (units === 0) return 'soixante-dix';
    if (units === 1) return 'soixante-et-onze';
    return `soixante-${FR_TEENS[units]}`;
  }
  if (tens === 8) {
    if (units === 0) return 'quatre-vingts';
    return `quatre-vingt-${ones[units]}`;
  }
  // tens === 9
  if (units === 0) return 'quatre-vingt-dix';
  if (units === 1) return 'quatre-vingt-onze';
  return `quatre-vingt-${FR_TEENS[units]}`;
};

const ES_TEENS = [
  'diez', 'once', 'doce', 'trece', 'catorce', 'quince',
  'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve',
];
const ES_TWENTIES = [
  'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro',
  'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve',
];
const ES_TENS: Record<number, string> = {
  3: 'treinta', 4: 'cuarenta', 5: 'cincuenta', 6: 'sesenta', 7: 'setenta', 8: 'ochenta', 9: 'noventa',
};
const es = (n: number, ones: string[]): string => {
  if (n < 10) return ones[n];
  if (n < 20) return ES_TEENS[n - 10];
  if (n < 30) return ES_TWENTIES[n - 20];
  const tens = Math.floor(n / 10);
  const units = n % 10;
  if (units === 0) return ES_TENS[tens];
  return `${ES_TENS[tens]} y ${ones[units]}`;
};

const RU_TEENS = [
  'десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать',
  'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать',
];
const RU_TENS: Record<number, string> = {
  2: 'двадцать', 3: 'тридцать', 4: 'сорок', 5: 'пятьдесят',
  6: 'шестьдесят', 7: 'семьдесят', 8: 'восемьдесят', 9: 'девяносто',
};
const ru = (n: number, ones: string[]): string => {
  if (n < 10) return ones[n];
  if (n < 20) return RU_TEENS[n - 10];
  const tens = Math.floor(n / 10);
  const units = n % 10;
  if (units === 0) return RU_TENS[tens];
  return `${RU_TENS[tens]} ${ones[units]}`;
};

/** 0〜99 の、単語での読み方。範囲外・非整数は算用数字の文字列にフォールバックする。 */
export const extendedNumberWord = (n: number, lang: Lang): string => {
  if (!Number.isInteger(n) || n < 0 || n > 99) return String(n);
  const ones = NUMBER_WORDS[lang];
  switch (lang) {
    case 'ja':
      return sinoStyle(n, ones, '十');
    case 'zh':
      return sinoStyle(n, ones, '十');
    case 'ko':
      return sinoStyle(n, ones, '십');
    case 'en':
      return en(n);
    case 'de':
      return de(n, ones);
    case 'fr':
      return fr(n, ones);
    case 'es':
      return es(n, ones);
    case 'ru':
      return ru(n, ones);
    default:
      return String(n);
  }
};
