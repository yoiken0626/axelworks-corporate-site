'use client';

import { useEffect, useRef } from 'react';
import { ui } from '@/app/_libs/ui-strings';
import { type Lang } from '@/app/_libs/lang';
import { type DictationBoundaryMode } from '@/app/_libs/dictation-segmenter';
import {
  PRACTICE_MIN_RATE,
  PRACTICE_MAX_RATE,
  PRACTICE_RATE_STEP,
  type UsePracticeReadAloudReturn,
} from '@/app/_libs/usePracticeReadAloud';
import styles from './index.module.css';

// 現在の区間の文字を、パネルの中にも表示するか。本文側の青いハイライトと内容が
// 重複するため既定では出さない（false）。表示コードは削除せず、この定数を true に
// すれば元通り出せるようにしておく。
const SHOW_SEGMENT_TEXT_IN_PANEL = false;

const PencilIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
  </svg>
);

// キーボードショートカットの扱いを、今フォーカスされている要素の種類で変える。
// - textInput: すべてのショートカットを無効にする
// - rangeSlider: 矢印キー（← → ↑ ↓）はスライダー自身の操作に譲る。R/Enter/Esc は動く
// - buttonOrLink: Enter は、そのボタン/リンクの標準の動作に譲る（二重発火を避ける）。
//   R/Esc/→ は動く
// - other: すべて動く
type FocusContext = 'textInput' | 'rangeSlider' | 'buttonOrLink' | 'other';

const getFocusContext = (): FocusContext => {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return 'other';
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable) return 'textInput';
  if (tag === 'INPUT') {
    return (el as HTMLInputElement).type === 'range' ? 'rangeSlider' : 'textInput';
  }
  if (tag === 'BUTTON' || tag === 'A') return 'buttonOrLink';
  return 'other';
};

type Props = {
  lang: Lang;
  practice: UsePracticeReadAloudReturn;
};

/**
 * 記事ページ専用の「ディクテーション練習」入り口ボタン + パネル。
 * 入り口ボタンは常に表示、パネルは practice.isOpen のときだけ表示する。
 *
 * ボタンは「開始／もう一度」「次へ」「終了」の3つ。区間の文字は、本文側の
 * 青いハイライト（usePracticeHighlight）と内容が重複するため、パネルには
 * 出さない（SHOW_SEGMENT_TEXT_IN_PANEL 定数で切り替え可能。非表示・答え合わせの
 * 仕組みは usePracticeReadAloud 側に残しているが、ここでは使わない）。
 */
export default function PracticePanel({ lang, practice }: Props) {
  const {
    isOpen,
    open,
    close,
    boundaryMode,
    setBoundaryMode,
    rate,
    setRate,
    status,
    currentIndex,
    total,
    currentSegment,
    start,
    replay,
    next,
    restartFromBeginning,
    hasNext,
  } = practice;

  const entryButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // パネルを開いたら見出しへフォーカスする（キーボード操作の起点にする）
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (isOpen) headingRef.current?.focus();
  }, [isOpen]);

  // キーボードショートカット: R=もう一度, Enter/→=次へ（未開始なら開始）, Esc=終了
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const ctx = getFocusContext();
      if (ctx === 'textInput') return;
      if (ctx === 'rangeSlider' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        return; // スライダー自身の操作に譲る
      }

      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          close();
          entryButtonRef.current?.focus();
          break;
        case 'r':
        case 'R':
          if (status !== 'idle' && status !== 'finished') {
            e.preventDefault();
            replay();
          }
          break;
        case 'Enter':
          if (ctx === 'buttonOrLink') break; // フォーカス中のボタンの標準動作に譲る（二重発火を避ける）
          e.preventDefault();
          if (status === 'idle') start();
          else if (status !== 'finished' && hasNext) next();
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (status === 'idle') start();
          else if (status !== 'finished' && hasNext) next();
          break;
        default:
          break;
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, status, hasNext, close, replay, start, next]);

  // 外側タップで閉じる
  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || entryButtonRef.current?.contains(target)) return;
      close();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [isOpen, close]);

  const boundaryOptions: { value: DictationBoundaryMode; labelKey: 'practiceBoundaryCommaPeriod' | 'practiceBoundarySentence' }[] = [
    { value: 'commaPeriod', labelKey: 'practiceBoundaryCommaPeriod' },
    { value: 'sentence', labelKey: 'practiceBoundarySentence' },
  ];

  const progressLabel = ui('practiceProgress', lang)
    .replace('{current}', String(Math.min(currentIndex + 1, total)))
    .replace('{total}', String(total));

  return (
    <>
      <button
        type="button"
        ref={entryButtonRef}
        className={styles.entryButton}
        onClick={() => (isOpen ? close() : open())}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={ui('practiceEntryAriaLabel', lang)}
      >
        <PencilIcon />
        <span aria-hidden="true">{ui('practiceEntryLabel', lang)}</span>
      </button>

      {isOpen && (
        <div ref={panelRef} className={styles.panel} role="dialog" aria-label={ui('practicePanelHeading', lang)}>
          <div className={styles.header}>
            <h2 ref={headingRef} tabIndex={-1} className={styles.heading}>
              {ui('practicePanelHeading', lang)}
            </h2>
            <button type="button" className={styles.closeButton} onClick={close}>
              {ui('practiceFinish', lang)}
            </button>
          </div>

          <div className={styles.row} role="radiogroup" aria-label={ui('practiceBoundaryLabel', lang)}>
            {boundaryOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={boundaryMode === opt.value}
                className={styles.segmentButton}
                data-active={boundaryMode === opt.value}
                onClick={() => setBoundaryMode(opt.value)}
              >
                {ui(opt.labelKey, lang)}
              </button>
            ))}
          </div>

          <div className={styles.row}>
            <label className={styles.rateLabel}>
              {ui('readAloudSpeed', lang)}
              <input
                type="range"
                className={styles.rateSlider}
                min={PRACTICE_MIN_RATE}
                max={PRACTICE_MAX_RATE}
                step={PRACTICE_RATE_STEP}
                value={rate}
                onChange={(e) => setRate(Number(e.target.value))}
                aria-label={`${ui('readAloudSpeed', lang)} ${rate.toFixed(1)}x`}
              />
              <span className={styles.rateValue}>{rate.toFixed(1)}x</span>
            </label>
          </div>

          {status === 'finished' ? (
            <div className={styles.finished}>
              <p className={styles.finishedHeading}>{ui('practiceFinishedHeading', lang)}</p>
              <div className={styles.buttonRow}>
                <button type="button" className={styles.primaryButton} onClick={restartFromBeginning}>
                  {ui('practiceRestart', lang)}
                </button>
                <button type="button" className={styles.secondaryButton} onClick={close}>
                  {ui('practiceFinish', lang)}
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className={styles.progress} aria-live="polite">
                {total > 0 ? progressLabel : ''}
              </p>

              {SHOW_SEGMENT_TEXT_IN_PANEL && (
                <div className={styles.textArea}>
                  <p className={styles.segmentText}>{currentSegment?.text ?? ''}</p>
                </div>
              )}

              {status === 'error' && <p className={styles.errorNote}>{ui('readAloudError', lang)}</p>}

              <div className={styles.buttonRow}>
                <button type="button" className={styles.primaryButton} onClick={status === 'idle' ? start : replay}>
                  {status === 'idle' ? ui('practiceStart', lang) : ui('practiceReplay', lang)}
                </button>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={next}
                  disabled={!hasNext || status === 'idle'}
                >
                  {ui('practiceNext', lang)}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
