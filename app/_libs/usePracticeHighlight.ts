'use client';

import { useEffect, useRef } from 'react';
import { stripEmoji } from './emoji';
import { stripReadAloudMarks } from './read-aloud-marks';
import {
  stripWs,
  isHighlightApiSupported,
  clearHighlightByName,
  buildCharIndex,
  makeRange,
  getHighlightRoots,
  wrapRangeWithMark,
  clearMarks,
} from './highlight-dom';
import { type DictationSegment } from './dictation-segmenter';

/**
 * ディクテーション練習モード用の、本文上の青ハイライト＋追従スクロール。
 *
 * 通常の読み上げ（useReadAloudHighlight）と同じ低レベルの仕組み（highlight-dom.ts、
 * CSS Custom Highlight API）を再利用するが、上位のマッチング方法は単純にしている:
 * 通常側は「チャンク内のどの文か」を再生進捗から推定するのに対し、練習側は区間
 * （区切りで確定済みの1つの塊）をまるごと1つの Range としてハイライトすればよく、
 * 進捗による推定が不要なため。
 */

const HIGHLIGHT_NAME = 'read-aloud-practice';
const isSupported = isHighlightApiSupported;

// 「見える範囲」の上下の余白（px）。ここが快適な帯の中心に区間が来るようにする。
const VIEWPORT_MARGIN = 16;
const MOBILE_BREAKPOINT = 950; // PageReadAloud の CSS ブレークポイントと合わせる

type Params = {
  /** 表示順の区間一覧（開いていないときは空配列でよい） */
  segments: DictationSegment[];
  /** 現在の区間 index（-1 = なし） */
  currentIndex: number;
  /** start/next/previous/restart など「区間が切り替わった」ときだけ増える値。
      replay・速度変更では増えない（＝この値だけを見てスクロールの要否を判定する）。 */
  moveSeq: number;
  /** 練習パネルが開いているか（閉じていれば何もしない・ハイライトを消す） */
  enabled: boolean;
};

const getVisibleBounds = (): { top: number; bottom: number } => {
  const headerBottom = document.querySelector('header')?.getBoundingClientRect().bottom ?? 0;
  const entryBottom =
    document.querySelector('button[aria-haspopup="dialog"]')?.getBoundingClientRect().bottom ?? 0;
  const top = Math.max(headerBottom, entryBottom) + VIEWPORT_MARGIN;

  const isMobileSheet = typeof window !== 'undefined' && window.innerWidth <= MOBILE_BREAKPOINT;
  const panelTop = document.querySelector('[role="dialog"]')?.getBoundingClientRect().top;
  const bottom =
    isMobileSheet && typeof panelTop === 'number'
      ? panelTop - VIEWPORT_MARGIN
      : window.innerHeight - VIEWPORT_MARGIN;

  return { top, bottom };
};

// フォールバック（<mark>）専用: そのときの実際の DOM から、1 区間分のテキストの
// Range を探し直す。前後の <mark> 適用/解除でテキストノードが分割されていても、
// buildCharIndex は全テキストノードを歩いて連結するので、断片化の影響を受けない。
const findFreshRangeForText = (text: string): Range | null => {
  const roots = getHighlightRoots();
  if (roots.length === 0) return null;
  const { chars, flat, flatToChar } = buildCharIndex(roots);
  if (chars.length === 0) return null;
  const needle = stripReadAloudMarks(stripEmoji(stripWs(text)));
  if (!needle) return null;
  const pos = flat.indexOf(needle);
  if (pos < 0) return null;
  const startChar = flatToChar.get(pos);
  if (startChar === undefined) return null;
  const endChar = flatToChar.get(pos + needle.length) ?? chars.length;
  return makeRange(chars, startChar, endChar);
};

export function usePracticeHighlight({ segments, currentIndex, moveSeq, enabled }: Params): void {
  const rangesRef = useRef<(Range | null)[]>([]);
  const activeIdxRef = useRef(-1);
  const lastScrolledMoveSeqRef = useRef(-1);

  const segmentsKey = segments.map((s) => s.text).join('\u0000');

  // (1) 区間ごとの Range を組み立てる（開いた・区切りの種類が変わった・言語が変わったとき）。
  // Range の構築自体は Highlight API の対応有無に関係なく行う（フォールバック
  // の <mark> 方式でも同じ Range を使う。スクロール計算にも必要）。
  useEffect(() => {
    if (!enabled) {
      rangesRef.current = [];
      activeIdxRef.current = -1;
      clearHighlightByName(HIGHLIGHT_NAME);
      clearMarks(HIGHLIGHT_NAME);
      return;
    }
    const roots = getHighlightRoots();
    if (roots.length === 0) {
      rangesRef.current = [];
      return;
    }
    const { chars, flat, flatToChar } = buildCharIndex(roots);
    if (chars.length === 0) {
      rangesRef.current = [];
      return;
    }

    const ranges: (Range | null)[] = [];
    let flatCursor = 0;
    let charCursor = 0;
    for (const seg of segments) {
      const needle = stripReadAloudMarks(stripEmoji(stripWs(seg.text)));
      if (!needle) {
        ranges.push(null);
        continue;
      }
      let startChar: number;
      let endChar: number;
      const pos = flat.indexOf(needle, flatCursor);
      if (pos >= 0) {
        startChar = flatToChar.get(pos) ?? charCursor;
        endChar = flatToChar.get(pos + needle.length) ?? chars.length;
        flatCursor = pos + needle.length;
      } else {
        startChar = Math.min(charCursor, Math.max(0, chars.length - 1));
        endChar = Math.min(chars.length, startChar + needle.length);
        flatCursor = Math.min(flat.length, flatCursor + needle.length);
      }
      charCursor = endChar;
      ranges.push(makeRange(chars, startChar, endChar));
    }
    rangesRef.current = ranges;
    activeIdxRef.current = -1;

    return () => {
      rangesRef.current = [];
      activeIdxRef.current = -1;
      clearHighlightByName(HIGHLIGHT_NAME);
      clearMarks(HIGHLIGHT_NAME);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segmentsKey, enabled]);

  // (2) 現在の区間をハイライトする。CSS Custom Highlight API に対応していれば
  // それを使う（DOM を書き換えない、(1)で組み立てた Range をそのまま使う）。
  // 非対応ブラウザ（例: Firefox）では <mark> で囲むフォールバックを使う。
  //
  // フォールバックは (1) の Range を再利用しない。<mark> で囲む／外す操作自体が
  // テキストノードを分割するため、他区間向けに事前計算した Range の境界が
  // ずれてしまう（分割されたノードを参照したままになる）。そのため、適用する
  // 直前に、そのときの実際の DOM から改めて 1 区間分だけ探し直す（多少コストは
  // 掛かるが、テキスト量的に無視できる範囲で、対応ブラウザが少ないフォールバック
  // 専用の処理なので許容する）。
  useEffect(() => {
    if (!enabled) return;
    const list = rangesRef.current;
    if (currentIndex < 0 || currentIndex >= list.length) {
      if (activeIdxRef.current >= 0) {
        activeIdxRef.current = -1;
        clearHighlightByName(HIGHLIGHT_NAME);
        clearMarks(HIGHLIGHT_NAME);
      }
      return;
    }
    if (activeIdxRef.current === currentIndex) return;
    activeIdxRef.current = currentIndex;

    if (isSupported()) {
      const range = list[currentIndex];
      if (!range) {
        clearHighlightByName(HIGHLIGHT_NAME);
        return;
      }
      try {
        CSS.highlights.set(HIGHLIGHT_NAME, new Highlight(range));
      } catch {
        /* noop */
      }
      return;
    }

    clearMarks(HIGHLIGHT_NAME);
    const text = segments[currentIndex]?.text;
    if (!text) return;
    const freshRange = findFreshRangeForText(text);
    if (freshRange) wrapRangeWithMark(freshRange, HIGHLIGHT_NAME);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, currentIndex]);

  // (3) 区間が切り替わったとき（moveSeq）だけ、見える範囲に入るようスクロールする。
  //     もう一度・速度変更では moveSeq が増えないため、ここは実行されない。
  // 実行順序: このコンポーネント内で (2) は (3) より前に宣言されているため、
  // React は毎レンダー後、常に (2) → (3) の順で実行する。フォールバック時は
  // (2) が直前に <mark> を適用済みなので、(3) はその実際の要素から座標を取る
  // （(1) の Range は DOM 変化で古くなっている可能性があるため使わない）。
  useEffect(() => {
    if (!enabled) return;
    if (moveSeq === lastScrolledMoveSeqRef.current) return;
    lastScrolledMoveSeqRef.current = moveSeq;

    let rect: DOMRect | null = null;
    if (isSupported()) {
      const range = currentIndex >= 0 ? rangesRef.current[currentIndex] : null;
      rect = range ? range.getBoundingClientRect() : null;
    } else {
      const marks = document.querySelectorAll(`mark[data-highlight-mark="${HIGHLIGHT_NAME}"]`);
      if (marks.length > 0) {
        const rects = Array.from(marks).map((m) => m.getBoundingClientRect());
        rect = new DOMRect(
          Math.min(...rects.map((r) => r.left)),
          Math.min(...rects.map((r) => r.top)),
          Math.max(...rects.map((r) => r.right)) - Math.min(...rects.map((r) => r.left)),
          Math.max(...rects.map((r) => r.bottom)) - Math.min(...rects.map((r) => r.top)),
        );
      }
    }
    if (!rect) return;
    if (rect.width === 0 && rect.height === 0) return;

    const { top, bottom } = getVisibleBounds();
    const visibleHeight = bottom - top;
    if (visibleHeight <= 0) return;

    const alreadyVisible = rect.top >= top && rect.bottom <= bottom;
    if (alreadyVisible) return;

    const reduceMotion =
      typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let delta: number;
    if (rect.height > visibleHeight) {
      // 区間が見える範囲より高い: 上端を見える範囲の上端に合わせる
      delta = rect.top - top;
    } else {
      // 見える範囲の中央に来るようにする
      const rectMid = rect.top + rect.height / 2;
      const boundsMid = top + visibleHeight / 2;
      delta = rectMid - boundsMid;
    }
    window.scrollBy({ top: delta, behavior: reduceMotion ? 'auto' : 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moveSeq, enabled]);

  // アンマウント時に確実に消す
  useEffect(
    () => () => {
      clearHighlightByName(HIGHLIGHT_NAME);
      clearMarks(HIGHLIGHT_NAME);
    },
    [],
  );
}
