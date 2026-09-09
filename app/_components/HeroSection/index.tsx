'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import HeroQueen from '@/app/_components/HeroQueen';
import { ui } from '@/app/_libs/ui-strings';
import { type Lang } from '@/app/_libs/lang';
import { READ_ALOUD_MIN_RATE, READ_ALOUD_MAX_RATE, type ReadAloudStatus } from '@/app/_libs/useReadAloud';
import styles from './index.module.css';

// SSR では何もしない useLayoutEffect（クライアントでは通常の useLayoutEffect）。
// マウント直後・再計算のたびに描画前へ座標を反映し、position:fixed 化に伴う
// 位置のガタつき（一瞬 CSS の初期値で描画されてから飛ぶ）を防ぐ。
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

// コントロールを .section（ヒーロー画像のコンテナ）の右上角から何 px 内側に
// 置くか。これまでの position:absolute 実装と同じ値をそのまま踏襲する。
const DESKTOP_INSET_PX = 10;
const MOBILE_INSET_PX = 6;
// index.module.css の @media (max-width: 950px) と揃える
const MOBILE_BREAKPOINT_PX = 950;

type Props = {
  lang: Lang;
  /** 読み上げの発話タイミングに同期した口の開閉 */
  mouthOpen: boolean;
  /** ヒーローの吹き出しに出す最新記事（無ければ null） */
  latestNews: { slug: string; title: string } | null;
  status: ReadAloudStatus;
  rate: number;
  setRate: (rate: number) => void;
  toggle: () => void;
  stop: () => void;
};

const PlayIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M8 5v14l11-7z" />
  </svg>
);

const PauseIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
  </svg>
);

const StopIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <rect x="6" y="6" width="12" height="12" rx="1.5" />
  </svg>
);

export default function HeroSection({ lang, mouthOpen, latestNews, status, rate, setRate, toggle, stop }: Props) {
  const sectionRef = useRef<HTMLDivElement>(null);
  // position:fixed なコントロールの座標（ビューポート基準）。null の間は
  // index.module.css の初期値（デスクトップ相当）で描画される。
  const [fixedPos, setFixedPos] = useState<{ top: number; right: number } | null>(null);

  useIsomorphicLayoutEffect(() => {
    const updatePosition = () => {
      const section = sectionRef.current;
      if (!section) return;
      const rect = section.getBoundingClientRect();
      const inset = window.innerWidth <= MOBILE_BREAKPOINT_PX ? MOBILE_INSET_PX : DESKTOP_INSET_PX;
      // rect.top はスクロール量ぶん減っていくので scrollY を足し戻し、
      // スクロールしても常に同じ画面位置になる「静止時の座標」を求める。
      setFixedPos({
        top: rect.top + window.scrollY + inset,
        right: window.innerWidth - rect.right + inset,
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    return () => window.removeEventListener('resize', updatePosition);
  }, []);

  return (
    <div className={styles.section} ref={sectionRef}>
      {/* ページの主題を表す h1。デザインを崩さないよう視覚的には隠す（SR / SEO 向け） */}
      <h1 className="srOnly">{ui('homeHeading', lang)}</h1>
      <HeroQueen lang={lang} mouthOpen={mouthOpen} latestNews={latestNews} />

      {/* ヒーロー画像の右上に浮かぶ小型コントロール。地球儀はイラストに埋め込み済みなので
          ここには置かない。position:fixed で常に画面上の同じ位置に留まる
          （見た目上はヒーロー画像に重なって見える座標を .section の実測値から
          計算し、top/right の inline style として反映する）。 */}
      <div
        className={styles.control}
        style={fixedPos ? { top: fixedPos.top, right: fixedPos.right } : undefined}
        role="group"
        aria-label={ui('readAloudPlay', lang)}
      >
        <button
          type="button"
          className={styles.iconButton}
          onClick={toggle}
          aria-pressed={status === 'playing'}
          aria-label={status === 'playing' ? ui('readAloudPause', lang) : ui('readAloudPlay', lang)}
        >
          {status === 'playing' ? <PauseIcon /> : <PlayIcon />}
        </button>

        <button
          type="button"
          className={styles.iconButton}
          onClick={stop}
          disabled={status === 'idle'}
          aria-label={ui('readAloudStop', lang)}
        >
          <StopIcon />
        </button>

        <span className={styles.divider} aria-hidden="true" />

        <input
          type="range"
          className={styles.speed}
          min={READ_ALOUD_MIN_RATE}
          max={READ_ALOUD_MAX_RATE}
          step={0.05}
          value={rate}
          onChange={(e) => setRate(Number(e.target.value))}
          aria-label={`${ui('readAloudSpeed', lang)} ${rate.toFixed(2)}x`}
        />
        <span className={styles.speedValue}>{rate.toFixed(1)}x</span>
      </div>
    </div>
  );
}
