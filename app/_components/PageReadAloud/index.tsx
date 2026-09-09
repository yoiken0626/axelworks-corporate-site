'use client';

import GlobeLanguageSwitcher from '@/app/_components/GlobeLanguageSwitcher';
import { ui } from '@/app/_libs/ui-strings';
import { type Lang } from '@/app/_libs/lang';
import { useReadAloud, READ_ALOUD_MIN_RATE, READ_ALOUD_MAX_RATE } from '@/app/_libs/useReadAloud';
import { useReadAloudHighlight } from '@/app/_libs/useReadAloudHighlight';
import { useScrollDock } from '@/app/_libs/useScrollDock';
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
 * ページ上部に固定表示する「地球儀の言語スイッチャー + 読み上げコントロール」。
 * ContactGlobe と同じ position:fixed パターン。口パク同期は無し（コントロールのみ）。
 *
 * スクロール位置に応じて表示位置を切り替える:
 * - ページ上部（ヘッダー画像に重なる高さ）にいる間は、画像の左右の白い余白に配置
 * - ヘッダー画像の下端（センチネル）を過ぎたら、画面最上部へせり上げる（ドック）
 *   ヘッダーは position:absolute でこの時点では画面外なのでリングと干渉しない。
 */
export default function PageReadAloud({ lang, segments }: Props) {
  const { status, rate, setRate, toggle, stop, chunks, chunkSegments, activeChunk, chunkProgress } =
    useReadAloud(segments, lang);

  // 読み上げ中のチャンクを本文（[data-read-aloud-body]）上でハイライトし、
  // 再生位置を画面内に追従させる。本文が無いページでは何もしない。
  useReadAloudHighlight({ chunks, chunkSegments, activeChunk, chunkProgress, follow: true });

  // ヘッダー画像直後のセンチネルが画面上端より上へ出たら「ドック」状態にする。
  const docked = useScrollDock();

  return (
    // 本文シート（.container）と同じ幅・センタリングで固定表示する枠。
    // この枠の左右パディング相当の余白（＝ヘッダー画像の左右の白い部分）に
    // 地球儀・読み上げコントロールを置くので、ビューポート幅が変わっても
    // 画像の左上・右上の角に追従する。枠自体はクリックを透過させる。
    <div className={styles.frame} data-docked={docked}>
      {/* 地球儀はヘッダー画像の左上の余白、読み上げコントロールは右上の余白に置く。 */}
      <div className={styles.globeBar}>
        <div className={styles.globe}>
          <GlobeLanguageSwitcher />
        </div>
      </div>

      <div className={styles.controlBar}>
        <div className={styles.control} role="group" aria-label={ui('readAloudPlay', lang)}>
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
    </div>
  );
}
