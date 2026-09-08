'use client';

import { useEffect, useRef } from 'react';
import { splitSentences } from './useReadAloud';
import { createEmojiMatcher, stripEmoji } from './emoji';
import { stripReadAloudMarks } from './read-aloud-marks';

/**
 * 読み上げ中の「文」をタイトル・本文上でハイライトするフック（CSS Custom Highlight API）。
 *
 * - 対象は `[data-read-aloud-title]`（記事タイトル H1）と `[data-read-aloud-body]`
 *   （本文）の中のテキスト。目次は対象外。タイトルは句点が無いことが多いので
 *   チャンク全体を 1 文として扱う。
 * - 読み上げ単位（チャンク）は複数の文を含むため、チャンク丸ごとを点灯すると
 *   記事の半分ほどが光ってしまう。そこでハイライトは「文単位」にする:
 *   - どのチャンクを再生中かは `activeChunk`。
 *   - チャンク内のどの文かは `chunkProgress`（= audio.currentTime / duration, 0〜1）と
 *     各文の文字数割合から推定する（読み速度は一定と仮定）。
 * - 文 → 本文 DOM の対応づけは「空白と絵文字を除いた文字列」で行う。読み上げテキスト
 *   （htmlToPlainText）は絵文字を除去済みなので、DOM 側も同じ除去をして突き合わせる。
 *   文字列は buildChunks / splitSentences がトリム・改行連結したものなので、
 *   空白・絵文字を落とせば本文プレーンテキストの部分文字列になる（＝文字数で一意に決まる）。
 *   一致しなければ直前の探索位置から文字数ぶん進めた範囲で近似する。
 * - 絵文字は chars 索引に入れないので、ハイライト範囲の端は絵文字を含まない。
 * - DOM を書き換えないので、記事本文の dangerouslySetInnerHTML と干渉しない。
 * - Highlight API 非対応ブラウザでは単に何もしない（プログレッシブエンハンスメント）。
 */

const HIGHLIGHT_NAME = 'read-aloud';
const TITLE_SELECTOR = '[data-read-aloud-title]';
const BODY_SELECTOR = '[data-read-aloud-body]';
const SKIP_SELECTOR = 'pre, code, script, style';

const stripWs = (s: string): string => s.replace(/\s+/g, '');

// DOM 上の 1 文字。offset は node.data 内の UTF-16 位置、len はその文字の長さ（1 or 2）。
type CharRef = { node: Text; offset: number; len: number };

type SentenceRange = {
  /** この文が属するチャンク index（hook の activeChunk と突き合わせる） */
  chunkIndex: number;
  /** 空白除去後の文字数（チャンク内の位置推定に使う） */
  strippedLen: number;
  /** DOM 上のこの文の範囲（タイトル or 本文） */
  range: Range;
};

type Params = {
  /** 全チャンクのテキスト（表示順） */
  chunks: string[];
  /** 各チャンクが属する segment index（0 = タイトル, 1 以降 = 本文） */
  chunkSegments: number[];
  /** 再生中のチャンク index（-1 = 停止 / アイドル） */
  activeChunk: number;
  /** アクティブチャンク内の進捗 0〜1（= audio.currentTime / duration） */
  chunkProgress: number;
  /** 再生位置を画面内に自動スクロール追従させるか */
  follow: boolean;
};

const isSupported = (): boolean =>
  typeof window !== 'undefined' &&
  typeof CSS !== 'undefined' &&
  'highlights' in CSS &&
  typeof Highlight !== 'undefined';

const clearHighlight = (): void => {
  try {
    CSS.highlights.delete(HIGHLIGHT_NAME);
  } catch {
    /* noop */
  }
};

/**
 * 渡された要素（タイトル→本文の順）の中の「空白・絵文字でない文字」を順に集め、
 * フラット文字列 / DOM 位置 / フラット文字列上の開始 index → chars index の対応表を作る。
 */
const buildCharIndex = (
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

const makeRange = (chars: CharRef[], startChar: number, endChar: number): Range => {
  const s = Math.max(0, Math.min(startChar, chars.length - 1));
  const e = Math.max(s + 1, Math.min(endChar, chars.length));
  const range = document.createRange();
  range.setStart(chars[s].node, chars[s].offset);
  range.setEnd(chars[e - 1].node, chars[e - 1].offset + chars[e - 1].len);
  return range;
};

export function useReadAloudHighlight({
  chunks,
  chunkSegments,
  activeChunk,
  chunkProgress,
  follow,
}: Params): void {
  // タイトル＋本文の全「文」の Range（表示順）
  const sentenceRangesRef = useRef<SentenceRange[]>([]);
  // チャンク index -> そのチャンク内の文の合計文字数（空白除去後）
  const chunkTotalsRef = useRef<Map<number, number>>(new Map());
  // いまハイライト中の sentenceRangesRef 内 index（-1 = なし）
  const activeIdxRef = useRef(-1);

  const chunksKey = chunks.join(' ');
  const segmentsKey = chunkSegments.join(',');

  // (1) タイトル / 本文 DOM とチャンク集合から「文ごとの Range」を組み立てる
  useEffect(() => {
    if (!isSupported()) return;
    const titleEl = document.querySelector<HTMLElement>(TITLE_SELECTOR);
    const bodyEl = document.querySelector<HTMLElement>(BODY_SELECTOR);
    // タイトル → 本文の順。チャンク（segment 0 = タイトル, 1+ = 本文）と並びを合わせる。
    const roots = [titleEl, bodyEl].filter((el): el is HTMLElement => el != null);
    if (roots.length === 0) return;

    const { chars, flat, flatToChar } = buildCharIndex(roots);
    if (chars.length === 0) return;

    const sentenceRanges: SentenceRange[] = [];
    const chunkTotals = new Map<number, number>();
    let flatCursor = 0; // フラット文字列内の探索開始位置
    let charCursor = 0; // chars 索引内の現在位置（フォールバック用）

    for (let ci = 0; ci < chunks.length; ci += 1) {
      const isTitle = chunkSegments[ci] === 0;
      if (isTitle && !titleEl) continue; // タイトル要素が無ければハイライトしない
      let chunkTotal = 0;

      // タイトルは句点が無いことが多いのでチャンク全体を 1 文として扱う
      const parts = isTitle ? [chunks[ci]] : splitSentences(chunks[ci]);
      parts.forEach((sentence) => {
        // 読み上げテキストと同じ除去（空白＋絵文字＋マーカー）をしてから突き合わせる
        const needle = stripReadAloudMarks(stripEmoji(stripWs(sentence)));
        if (!needle) return;
        chunkTotal += needle.length;

        let startChar: number;
        let endChar: number;
        const pos = flat.indexOf(needle, flatCursor);
        if (pos >= 0) {
          startChar = flatToChar.get(pos) ?? charCursor;
          endChar = flatToChar.get(pos + needle.length) ?? chars.length;
          flatCursor = pos + needle.length;
        } else {
          // 一致しないときは直前位置から文字数ぶん進めた範囲で近似
          startChar = Math.min(charCursor, Math.max(0, chars.length - 1));
          endChar = Math.min(chars.length, startChar + needle.length);
          flatCursor = Math.min(flat.length, flatCursor + needle.length);
        }
        charCursor = endChar;

        sentenceRanges.push({
          chunkIndex: ci,
          strippedLen: needle.length,
          range: makeRange(chars, startChar, endChar),
        });
      });

      chunkTotals.set(ci, chunkTotal);
    }

    sentenceRangesRef.current = sentenceRanges;
    chunkTotalsRef.current = chunkTotals;
    activeIdxRef.current = -1;

    return () => {
      sentenceRangesRef.current = [];
      chunkTotalsRef.current = new Map();
      activeIdxRef.current = -1;
      clearHighlight();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chunksKey, segmentsKey]);

  // (2) activeChunk + chunkProgress から「いま読んでいる文」を推定してハイライト
  useEffect(() => {
    if (!isSupported()) return;
    const list = sentenceRangesRef.current;

    const setActive = (idx: number) => {
      if (idx === activeIdxRef.current) return;
      activeIdxRef.current = idx;
      if (idx < 0) {
        clearHighlight();
        return;
      }
      try {
        CSS.highlights.set(HIGHLIGHT_NAME, new Highlight(list[idx].range));
      } catch {
        /* noop */
      }
    };

    if (activeChunk < 0 || list.length === 0) {
      setActive(-1);
      return;
    }

    const inChunk = list.filter((s) => s.chunkIndex === activeChunk);
    if (inChunk.length === 0) {
      // このチャンクに対応する DOM 範囲が取れなかった（タイトル要素なし等）：ハイライトなし
      setActive(-1);
      return;
    }

    const total = chunkTotalsRef.current.get(activeChunk) || 0;
    const pos = Math.max(0, Math.min(1, chunkProgress)) * total;

    let acc = 0;
    let target = inChunk[0];
    for (let i = 0; i < inChunk.length; i += 1) {
      const s = inChunk[i];
      if (pos < acc + s.strippedLen || i === inChunk.length - 1) {
        target = s;
        break;
      }
      acc += s.strippedLen;
    }
    setActive(list.indexOf(target));
  }, [activeChunk, chunkProgress, chunksKey]);

  // (3) いまの文をビューポート内に追従させる
  useEffect(() => {
    if (!isSupported() || !follow) return;
    const idx = activeIdxRef.current;
    if (idx < 0) return;
    const sr = sentenceRangesRef.current[idx];
    if (!sr) return;

    const rect = sr.range.getBoundingClientRect();
    if (rect.height === 0 && rect.width === 0) return;

    const vh = window.innerHeight;
    const mid = rect.top + rect.height / 2;
    // 快適な帯（15%〜70%）から外れたときだけ中央（40%）へ寄せる
    if (mid < vh * 0.15 || mid > vh * 0.7) {
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollBy({ top: mid - vh * 0.4, behavior: reduceMotion ? 'auto' : 'smooth' });
    }
  }, [follow, activeChunk, chunkProgress]);

  // アンマウント時に確実に消す
  useEffect(() => clearHighlight, []);
}
