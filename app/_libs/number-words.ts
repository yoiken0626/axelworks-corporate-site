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
