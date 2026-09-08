'use client';

import { useEffect, useRef } from 'react';
import { splitSentences } from './useReadAloud';

/**
 * 読み上げ中の「文」を本文上でハイライトするフック（CSS Custom Highlight API）。
 *
 * - 対象は `[data-read-aloud-body]` 要素の中のテキストのみ（タイトルや目次は対象外）。
 * - 読み上げ単位（チャンク）は複数の文を含むため、チャンク丸ごとを点灯すると
 *   記事の半分ほどが光ってしまう。そこでハイライトは「文単位」にする:
 *   - どのチャンクを再生中かは `activeChunk`。
 *   - チャンク内のどの文かは `chunkProgress`（= audio.currentTime / duration, 0〜1）と
 *     各文の文字数割合から推定する（読み速度は一定と仮定）。
 * - 文 → 本文 DOM の対応づけは「空白を除いた文字列」で行う。
 *   文字列は buildChunks / splitSentences がトリム・改行連結したものなので、
 *   空白を全部落とせば本文プレーンテキストの部分文字列になる（＝文字数で一意に決まる）。
 *   一致しなければ直前の探索位置から文字数ぶん進めた範囲で近似する。
 * - DOM を書き換えないので、記事本文の dangerouslySetInnerHTML と干渉しない。
 * - Highlight API 非対応ブラウザでは単に何もしない（プログレッシブエンハンスメント）。
 */

const HIGHLIGHT_NAME = 'read-aloud';
const BODY_SELECTOR = '[data-read-aloud-body]';
const SKIP_SELECTOR = 'pre, code, script, style';

const stripWs = (s: string): string => s.replace(/\s+/g, '');

type CharRef = { node: Text; offset: number };

type SentenceRange = {
  /** この文が属するチャンク index（hook の activeChunk と突き合わせる） */
  chunkIndex: number;
  /** 空白除去後の文字数（チャンク内の位置推定に使う） */
  strippedLen: number;
  /** 本文 DOM 上のこの文の範囲 */
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

/** 本文要素内の「空白でない文字」を順に集め、フラット文字列と DOM 位置の対応表を作る。 */
const buildCharIndex = (root: HTMLElement): { chars: CharRef[]; flat: string } => {
  const chars: CharRef[] = [];
  let flat = '';
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
    for (let i = 0; i < text.length; i += 1) {
      if (!/\s/.test(text[i])) {
        chars.push({ node, offset: i });
        flat += text[i];
      }
    }
    node = walker.nextNode() as Text | null;
  }
  return { chars, flat };
};

const makeRange = (chars: CharRef[], start: number, end: number): Range => {
  const s = Math.max(0, Math.min(start, chars.length - 1));
  const e = Math.max(s + 1, Math.min(end, chars.length));
  const range = document.createRange();
  range.setStart(chars[s].node, chars[s].offset);
  range.setEnd(chars[e - 1].node, chars[e - 1].offset + 1);
  return range;
};

export function useReadAloudHighlight({
  chunks,
  chunkSegments,
  activeChunk,
  chunkProgress,
  follow,
}: Params): void {
  // 本文の全「文」の Range（表示順、本文チャンクぶんだけ）
  const sentenceRangesRef = useRef<SentenceRange[]>([]);
  // チャンク index -> そのチャンク内の文の合計文字数（空白除去後）
  const chunkTotalsRef = useRef<Map<number, number>>(new Map());
  // いまハイライト中の sentenceRangesRef 内 index（-1 = なし）
  const activeIdxRef = useRef(-1);

  const chunksKey = chunks.join(' ');
  const segmentsKey = chunkSegments.join(',');

  // (1) 本文 DOM とチャンク集合から「文ごとの Range」を組み立てる
  useEffect(() => {
    if (!isSupported()) return;
    const root = document.querySelector<HTMLElement>(BODY_SELECTOR);
    if (!root) return;

    const { chars, flat } = buildCharIndex(root);
    if (chars.length === 0) return;

    const sentenceRanges: SentenceRange[] = [];
    const chunkTotals = new Map<number, number>();
    let cursor = 0; // フラット文字列内の探索開始位置（順方向に進める）

    for (let ci = 0; ci < chunks.length; ci += 1) {
      if (chunkSegments[ci] < 1) continue; // タイトル等はハイライトしない
      let chunkTotal = 0;

      splitSentences(chunks[ci]).forEach((sentence) => {
        const needle = stripWs(sentence);
        if (!needle) return;
        chunkTotal += needle.length;

        let start = flat.indexOf(needle, cursor);
        let end: number;
        if (start >= 0) {
          end = start + needle.length;
        } else {
          // 一致しないときは直前位置から文字数ぶん進めた範囲で近似
          start = Math.min(cursor, Math.max(0, flat.length - 1));
          end = Math.min(flat.length, start + needle.length);
        }
        cursor = end;

        sentenceRanges.push({
          chunkIndex: ci,
          strippedLen: needle.length,
          range: makeRange(chars, start, end),
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
      // タイトル等の再生中：ハイライトなし
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
