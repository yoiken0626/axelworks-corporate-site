import { load } from 'cheerio';

// 目次の 1 項目。level は H2=2 / H3=3。
export type TocItem = {
  id: string;
  text: string;
  level: 2 | 3;
};

// 記事内の見出し（H2+H3 の合計）がこの数以上あるときだけ目次を表示する。
export const TOC_MIN_HEADINGS = 3;

/**
 * 記事本文の HTML から H2 / H3 を抽出し、
 * - 各見出しに連番のアンカー ID（section-1, section-2 ...）を付与した HTML
 * - 目次リスト（TocItem[]）
 * を返す。
 *
 * 読み上げ機能（htmlToPlainText）はこの関数を通さない CMS 生データを使うため、
 * ここで ID を足しても読み上げ対象は変わらない。
 */
export const buildToc = (html: string): { html: string; toc: TocItem[] } => {
  const $ = load(html, null, false);
  const toc: TocItem[] = [];

  $('h2, h3').each((_, el) => {
    const $el = $(el);
    const text = $el.text().trim();
    if (!text) {
      return;
    }
    const id = `section-${toc.length + 1}`;
    $el.attr('id', id);
    const level = ($el.prop('tagName') || '').toLowerCase() === 'h3' ? 3 : 2;
    toc.push({ id, text, level });
  });

  return { html: $.html(), toc };
};
