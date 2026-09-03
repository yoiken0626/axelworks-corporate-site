'use client';

import GlobeLanguageSwitcher from '@/app/_components/GlobeLanguageSwitcher';
import { ui } from '@/app/_libs/ui-strings';
import { type Lang } from '@/app/_libs/lang';
import { useReadAloud, READ_ALOUD_MIN_RATE, READ_ALOUD_MAX_RATE } from '@/app/_libs/useReadAloud';
import styles from './index.module.css';

type Props = {
  lang: Lang;
  /** 読み上げるテキスト（表示順）。空文字は useReadAloud 側で除外される */
  segments: string[];
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

/**
 * ページ右上に固定表示する「地球儀の言語スイッチャー + 読み上げコントロール」。
 * ContactGlobe と同じ position:fixed パターン。口パク同期は無し（コントロールのみ）。
 */
export default function PageReadAloud({ lang, segments }: Props) {
  const { status, rate, setRate, toggle, stop, supported } = useReadAloud(segments, lang);

  return (
    <div className={styles.bar}>
      {supported && (
        <div className={styles.control} role="group" aria-label={ui('readAloudPlay', lang)}>
          <button
            type="button"
            className={styles.iconButton}
            onClick={toggle}
            aria-pressed={status === 'playing'}
            aria-label={
              status === 'playing' ? ui('readAloudPause', lang) : ui('readAloudPlay', lang)
            }
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
      )}

      <div className={styles.globe}>
        <GlobeLanguageSwitcher />
      </div>
    </div>
  );
}
