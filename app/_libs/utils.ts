import { formatInTimeZone } from 'date-fns-tz';
import { load } from 'cheerio';
import hljs from 'highlight.js';
import 'highlight.js/styles/hybrid.css';

export const formatDate = (date: string) => {
  return formatInTimeZone(new Date(date), 'Asia/Tokyo', 'yyyy/MM/dd');
};

export const formatRichText = (richText: string) => {
  const $ = load(richText, null, false);
  $('pre code').each((_, elm) => {
    const lang = $(elm).attr('class');
    const res = lang
      ? hljs.highlight($(elm).text(), { language: lang?.replace(/^language-/, '') || '' })
      : hljs.highlightAuto($(elm).text());
    $(elm).html(res.value);
  });
  return $.html();
};

// リッチテキスト（HTML）を読み上げ用のプレーンテキストに変換する。
// コード・スクリプトは読み上げても意味が無いので除去し、ブロック要素の区切りで
// 改行を入れて文の切れ目を作る。
export const htmlToPlainText = (richText: string): string => {
  const $ = load(richText, null, false);
  $('pre, code, script, style').remove();
  $('p, h1, h2, h3, h4, h5, h6, li, blockquote, figcaption, br, tr').each((_, elm) => {
    $(elm).append('\n');
  });
  return $.root()
    .text()
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
};
