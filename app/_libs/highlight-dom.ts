/**
 * CSS Custom Highlight API を使った「本文上の任意のテキスト範囲」を探す/ハイライトする
 * ための共通処理。useReadAloudHighlight（通常の読み上げ）と usePracticeHighlight
 * （ディクテーション練習）の両方から使う。
 *
 * - 対象は `[data-read-aloud-title]`（記事タイトル H1）と `[data-read-aloud-body]`（本文）。
 * - `pre, code, script, style, [data-read-aloud-skip]` は対象外（読み上げ対象外の要素と揃える）。
 * - 文字列の突き合わせは「空白と絵文字を除いた文字列」で行う（読み上げテキスト側も
 *   同じ除去をしてから呼び出すこと）。
 * - Highlight API 非対応ブラウザでは isSupported() が false を返すので、呼び出し側で
 *   フォールバック（<mark> 等）に切り替える。
 */

import { createEmojiMatcher } from './emoji';

export const TITLE_SELECTOR = '[data-read-aloud-title]';
export const BODY_SELECTOR = '[data-read-aloud-body]';
export const SKIP_SELECTOR = 'pre, code, script, style, [data-read-aloud-skip]';

export const stripWs = (s: string): string => s.replace(/\s+/g, '');

// DOM 上の 1 文字。offset は node.data 内の UTF-16 位置、len はその文字の長さ（1 or 2）。
export type CharRef = { node: Text; offset: number; len: number };

export const isHighlightApiSupported = (): boolean =>
  typeof window !== 'undefined' &&
  typeof CSS !== 'undefined' &&
  'highlights' in CSS &&
  typeof Highlight !== 'undefined';

export const clearHighlightByName = (name: string): void => {
  try {
    CSS.highlights.delete(name);
  } catch {
    /* noop */
  }
};

/**
 * 渡された要素（タイトル→本文の順）の中の「空白・絵文字でない文字」を順に集め、
 * フラット文字列 / DOM 位置 / フラット文字列上の開始 index → chars index の対応表を作る。
 */
export const buildCharIndex = (
  roots: HTMLElement[],
): { chars: CharRef[]; flat: string; flatToChar: Map<number, number> } => {
  const chars: CharRef[] = [];
  const flatToChar = new Map<number, number>();
  let flat = '';
  const emoji = createEmojiMatcher();

  for (const root of roots) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = (node as Text).parentElement;
        if (parent && parent.closest(SKIP_SELECTOR)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    let node = walker.nextNode() as Text | null;
    while (node) {
      const text = node.data;
      let i = 0;
      while (i < text.length) {
        emoji.lastIndex = i;
        const em = emoji.exec(text);
        if (em && em[0].length > 0) {
          i += em[0].length; // 絵文字シーケンスは丸ごと飛ばす
          continue;
        }
        const cp = text.codePointAt(i) as number;
        const len = cp > 0xffff ? 2 : 1;
        const ch = text.slice(i, i + len);
        if (!/\s/.test(ch)) {
          flatToChar.set(flat.length, chars.length);
          chars.push({ node, offset: i, len });
          flat += ch;
        }
        i += len;
      }
      node = walker.nextNode() as Text | null;
    }
  }
  return { chars, flat, flatToChar };
};

export const makeRange = (chars: CharRef[], startChar: number, endChar: number): Range => {
  const s = Math.max(0, Math.min(startChar, chars.length - 1));
  const e = Math.max(s + 1, Math.min(endChar, chars.length));
  const range = document.createRange();
  range.setStart(chars[s].node, chars[s].offset);
  range.setEnd(chars[e - 1].node, chars[e - 1].offset + chars[e - 1].len);
  return range;
};

export const getHighlightRoots = (): HTMLElement[] => {
  const titleEl = document.querySelector<HTMLElement>(TITLE_SELECTOR);
  const bodyEls = Array.from(document.querySelectorAll<HTMLElement>(BODY_SELECTOR));
  return [titleEl, ...bodyEls].filter((el): el is HTMLElement => el != null);
};

// ---- CSS Custom Highlight API 非対応ブラウザ向けのフォールバック ----------------
// <mark> で range を囲む。range が複数のテキストノード（リンク・太字等をまたぐ）に
// またがっていても、交差するテキストノードごとに個別の <mark> で囲むことで対応する
// （Range.surroundContents は「単一の要素で丸ごと囲める」範囲でないと例外を投げるため）。
export const MARK_CLASS_ATTR = 'data-highlight-mark';

export const wrapRangeWithMark = (range: Range, markName: string): void => {
  const startNode = range.startContainer;
  const endNode = range.endContainer;

  const wrapTextRange = (r: Range) => {
    if (r.collapsed) return;
    try {
      const mark = document.createElement('mark');
      mark.setAttribute(MARK_CLASS_ATTR, markName);
      mark.style.backgroundColor = 'var(--color-read-aloud-highlight)';
      mark.style.color = 'inherit';
      r.surroundContents(mark);
    } catch {
      /* この断片は囲めなかった（想定外のDOM構造）。他の断片には影響させない */
    }
  };

  if (startNode === endNode && startNode.nodeType === Node.TEXT_NODE) {
    wrapTextRange(range);
    return;
  }

  // 複数ノードにまたがる: range と交差するテキストノードを集め、それぞれの
  // 交差部分だけを個別の Range にして囲む。
  const ancestor = range.commonAncestorContainer;
  const rootEl = ancestor.nodeType === Node.TEXT_NODE ? ancestor.parentElement : (ancestor as Element | null);
  if (!rootEl) return;
  const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let node = walker.nextNode();
  while (node) {
    if (range.intersectsNode(node)) textNodes.push(node as Text);
    node = walker.nextNode();
  }
  for (const textNode of textNodes) {
    const nodeRange = document.createRange();
    nodeRange.selectNodeContents(textNode);
    if (textNode === range.startContainer) nodeRange.setStart(textNode, range.startOffset);
    if (textNode === range.endContainer) nodeRange.setEnd(textNode, range.endOffset);
    wrapTextRange(nodeRange);
  }
};

export const clearMarks = (markName: string): void => {
  const marks = document.querySelectorAll(`mark[${MARK_CLASS_ATTR}="${markName}"]`);
  marks.forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    // 注意: parent.normalize()（隣接テキストノードの結合）は呼ばない。まだ適用して
    // いない他区間の Range が、結合されて消えるテキストノードを参照していると、
    // 境界がずれて次にハイライトしたときに範囲が広がってしまう不具合の原因になる。
  });
};
