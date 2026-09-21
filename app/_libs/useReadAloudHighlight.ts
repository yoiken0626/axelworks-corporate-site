'use client';

import { useEffect, useRef } from 'react';
import { splitSentences } from './useReadAloud';
import { stripEmoji } from './emoji';
import { stripReadAloudMarks } from './read-aloud-marks';
import {
  TITLE_SELECTOR,
  BODY_SELECTOR,
  stripWs,
  isHighlightApiSupported,
  clearHighlightByName,
  buildCharIndex,
  makeRange,
} from './highlight-dom';

/**
 * 読み上げ中の「文」をタイトル・本文上でハイライトするフック（CSS Custom Highlight API）。
 *
 * - 対象は `[data-read-aloud-title]`（記事タイトル H1）と `[data-read-aloud-body]`
 *   （本文）の中のテキスト。`[data-read-aloud-body]` は文書内に複数あってもよい
 *   （例: トップページの News/Business/About/HireMe 各セクション）。querySelectorAll
 *   の返す文書順がそのままチャンクの表示順と対応する前提。目次は対象外。
 *   タイトルは句点が無いことが多いのでチャンク全体を 1 文として扱う。
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

// TODO(debug): 読み上げハイライトが出ない件の調査用ログ。原因確定後に削除する。
// ブラウザのコンソールで "[read-aloud-highlight]" で絞り込める。
const DBG = '[read-aloud-highlight]';
const dbg = (...args: unknown[]): void => {
  if (typeof console !== 'undefined') console.log(DBG, ...args);
};

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

const isSupported = isHighlightApiSupported;

const clearHighlight = (): void => clearHighlightByName(HIGHLIGHT_NAME);

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

  // (0) フック配線の調査ログ（1回だけ）。このログが出ないページ =
  //     useReadAloudHighlight がそもそも呼ばれていない。
  useEffect(() => {
    dbg('hook mounted', {
      path: typeof location !== 'undefined' ? location.pathname : '(ssr)',
      highlightApiSupported: isSupported(),
      segments: chunks.length,
      titleEls: document.querySelectorAll(TITLE_SELECTOR).length,
      bodyEls: document.querySelectorAll(BODY_SELECTOR).length,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // (1) タイトル / 本文 DOM とチャンク集合から「文ごとの Range」を組み立てる
  useEffect(() => {
    if (!isSupported()) {
      dbg('effect(1): Highlight API 非対応のため何もしない');
      return;
    }
    const titleEl = document.querySelector<HTMLElement>(TITLE_SELECTOR);
    const bodyEls = Array.from(document.querySelectorAll<HTMLElement>(BODY_SELECTOR));
    // タイトル → 本文の順。チャンク（segment 0 = タイトル, 1+ = 本文）と並びを合わせる。
    // 本文はページ内に複数箇所（トップページの News/Business/About/HireMe 各セクション等）
    // 散らばっていてもよい。querySelectorAll は文書順を返すので、そのままチャンクの
    // 表示順と一致する。
    const roots = [titleEl, ...bodyEls].filter((el): el is HTMLElement => el != null);
    if (roots.length === 0) {
      dbg('effect(1): [data-read-aloud-title]/[data-read-aloud-body] が両方見つからない → ハイライト対象なし', {
        titleEl: !!titleEl,
        bodyEls: bodyEls.length,
      });
      return;
    }

    const { chars, flat, flatToChar } = buildCharIndex(roots);
    if (chars.length === 0) {
      dbg('effect(1): 対象要素にテキストが無い（chars.length === 0）');
      return;
    }

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
    dbg('effect(1): 文ごとの Range 構築', {
      roots: roots.length,
      chars: chars.length,
      sentenceRanges: sentenceRanges.length,
    });

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
        dbg('setActive: ハイライト消灯');
        return;
      }
      try {
        CSS.highlights.set(HIGHLIGHT_NAME, new Highlight(list[idx].range));
        dbg('setActive: ハイライト点灯', { idx, text: list[idx].range.toString().slice(0, 30) });
      } catch (e) {
        dbg('setActive: CSS.highlights.set が例外', e);
      }
    };

    if (activeChunk < 0 || list.length === 0) {
      if (activeChunk >= 0 && list.length === 0) {
        dbg('effect(2): 再生中だが sentenceRanges が空 → 点灯できない');
      }
      setActive(-1);
      return;
    }

    const inChunk = list.filter((s) => s.chunkIndex === activeChunk);
    if (inChunk.length === 0) {
      // このチャンクに対応する DOM 範囲が取れなかった（タイトル要素なし等）：ハイライトなし
      dbg('effect(2): activeChunk に対応する Range が無い', { activeChunk });
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
