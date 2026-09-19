import { load } from 'cheerio';
import hljs from 'highlight.js';
import 'highlight.js/styles/hybrid.css';
import { stripEmoji } from './emoji';
import { READ_ALOUD_PAUSE_MARK, READ_ALOUD_LIST_MARK } from './read-aloud-marks';
import { convertLinkCards } from './link-cards';

// 自サイトのホスト名（記事本文の外部リンク判定で「外部」に含めない）
const SITE_HOSTNAMES = new Set(['axel-works.com', 'www.axel-works.com', 'localhost']);

// 記事本文中の外部リンクに target="_blank" / rel="noopener noreferrer" を付与する。
// http(s) 以外（#アンカー・mailto:・tel: など）や自サイトのリンクは対象外。
// 既存の rel は残しつつ足りないトークンだけ追加し、target は重複させない。
const addExternalLinkAttrs = ($: ReturnType<typeof load>) => {
  $('a[href]').each((_, elm) => {
    const $elm = $(elm);
    const href = $elm.attr('href') || '';
    if (!/^https?:\/\//i.test(href)) {
      return;
    }
    let hostname: string;
    try {
      hostname = new URL(href).hostname;
    } catch {
      return;
    }
    if (SITE_HOSTNAMES.has(hostname)) {
      return;
    }
    $elm.attr('target', '_blank');
    const existingRel = ($elm.attr('rel') || '').split(/\s+/).filter(Boolean);
    for (const token of ['noopener', 'noreferrer']) {
      if (!existingRel.includes(token)) {
        existingRel.push(token);
      }
    }
    $elm.attr('rel', existingRel.join(' '));
  });
};

// 非同期（OGPカード変換のためリンク先を取得する）。呼び出し元は await する必要がある。
export const formatRichText = async (richText: string): Promise<string> => {
  const $ = load(richText, null, false);
  $('pre code').each((_, elm) => {
    const lang = $(elm).attr('class');
    const res = lang
      ? hljs.highlight($(elm).text(), { language: lang?.replace(/^language-/, '') || '' })
      : hljs.highlightAuto($(elm).text());
    $(elm).html(res.value);
  });
  // リンクだけの段落をOGPカードに変換する（この後の addExternalLinkAttrs が
  // カードの <a> にも target="_blank" 等を通常のリンクと同じロジックで付与する）
  await convertLinkCards($);
  addExternalLinkAttrs($);
  return $.html();
};

// リッチテキスト（HTML）を読み上げ用のプレーンテキストに変換する。
// コード・スクリプトは読み上げても意味が無いので除去し、ブロック要素の区切りで
// 改行を入れて文の切れ目を作る。見出しや本文中の絵文字は発音されると不自然なので
// 取り除く（目次ラベルには影響しない。buildToc はこの関数を通さない）。
// 見出し（H1〜H6）とリスト項目（LI）の直前には不可視マーカーを差し込み、読み上げ側が
// それぞれを独立した単位にして直後に間を置けるようにする。
// 呼び出し側は formatRichText() 済みの HTML を渡すこと（[data-read-aloud-skip] は
// formatRichText が作る要素、例えばリンクカードに付く。コード整形・外部リンク属性の
// 付与はテキスト抽出結果に影響しないため、生の CMS 本文を渡した場合と結果は変わらない）。
export const htmlToPlainText = (richText: string): string => {
  const $ = load(richText, null, false);
  $('pre, code, script, style, [data-read-aloud-skip]').remove();
  $('p, h1, h2, h3, h4, h5, h6, li, blockquote, figcaption, br, tr').each((_, elm) => {
    $(elm).append('\n');
  });
  $('h1, h2, h3, h4, h5, h6').each((_, elm) => {
    $(elm).prepend(READ_ALOUD_PAUSE_MARK);
  });
  $('li').each((_, elm) => {
    $(elm).prepend(READ_ALOUD_LIST_MARK);
  });
  return stripEmoji($.root().text())
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
};
