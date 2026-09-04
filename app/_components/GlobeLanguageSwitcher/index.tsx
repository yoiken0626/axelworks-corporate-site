'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import classNames from 'classnames';
import { setLangCookie, type Lang } from '@/app/_libs/lang';
import styles from './index.module.css';

// three.js は重いので遅延ロード。地球儀はハイドレーション後にクライアントで描画する。
const Earth3D = dynamic(() => import('./Earth3D'), { ssr: false });

type Flag = {
  code: string;
  // public/flags/<icon>.svg（circle-flags 由来の円形SVG。ISO 3166-1 alpha-2）
  icon: string;
  label: string;
  lang?: Lang;
};

// 日・英・韓に対応。他は「準備中」ツールチップを表示する
const FLAGS: Flag[] = [
  { code: 'ja', icon: 'jp', label: '日本語', lang: 'ja' },
  { code: 'en', icon: 'us', label: 'English', lang: 'en' },
  { code: 'ko', icon: 'kr', label: '한국어', lang: 'ko' },
  { code: 'zh', icon: 'cn', label: '中文' },
  { code: 'es', icon: 'es', label: 'Español' },
  { code: 'de', icon: 'de', label: 'Deutsch' },
  { code: 'fr', icon: 'fr', label: 'Français' },
  { code: 'ru', icon: 'ru', label: 'Русский' },
];

// 国旗リングは地球儀(ルート要素)の中心を基準に等角で円状に配置する。
// 中心からの距離は CSS 変数 --gls-ring-radius で調整可能(既定はルート幅の125%)。
const RING_START_ANGLE = -90; // 真上から時計回り

const getFlagOffset = (index: number, total: number) => {
  const angle = ((RING_START_ANGLE + (360 / total) * index) * Math.PI) / 180;
  return { cos: Math.cos(angle).toFixed(4), sin: Math.sin(angle).toFixed(4) };
};

type Tooltip = { code: string; message: string };

type Props = {
  className?: string;
};

export default function GlobeLanguageSwitcher({ className }: Props) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);

  useEffect(() => {
    if (!tooltip) {
      return;
    }
    const timer = setTimeout(() => setTooltip(null), 1800);
    return () => clearTimeout(timer);
  }, [tooltip]);

  // lang Cookie を書き換えて表示言語を切り替える。
  const handleLangSelect = (flag: Flag) => {
    if (!flag.lang) {
      return;
    }
    setLangCookie(flag.lang);
    // 実際に言語が切り替わったら国旗リングを畳んで地球儀だけの状態に戻す。
    // （別言語に変えたいときは再度地球儀をクリックして展開する）
    setTooltip(null);
    setIsOpen(false);
    router.refresh();
  };

  const handleUnsupportedClick = (code: string) => {
    setTooltip({ code, message: '準備中' });
  };

  return (
    <div className={classNames(styles.root, className)}>
      <button
        type="button"
        className={styles.globeButton}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-label="表示言語を選択する"
      >
        <Earth3D className={styles.earthGlobe} />
      </button>

      <ul className={styles.flagList} aria-hidden={!isOpen}>
        {FLAGS.map((flag, index) => {
          const { cos, sin } = getFlagOffset(index, FLAGS.length);
          const isSupported = Boolean(flag.lang);
          return (
            <li
              key={flag.code}
              className={styles.flagItem}
              style={{
                left: `calc(50% + (${cos} * var(--gls-ring-radius, 125%)))`,
                top: `calc(50% + (${sin} * var(--gls-ring-radius, 125%)))`,
                transitionDelay: isOpen ? `${index * 40}ms` : '0ms',
              }}
              data-open={isOpen}
            >
              <button
                type="button"
                className={styles.flagButton}
                title={isSupported ? flag.label : `${flag.label}（準備中）`}
                aria-label={isSupported ? flag.label : `${flag.label}（準備中）`}
                tabIndex={isOpen ? 0 : -1}
                onClick={() =>
                  isSupported ? handleLangSelect(flag) : handleUnsupportedClick(flag.code)
                }
              >
                <Image
                  src={`/flags/${flag.icon}.svg`}
                  alt=""
                  width={48}
                  height={48}
                  className={styles.flagIcon}
                />
              </button>
              {tooltip?.code === flag.code && (
                <span className={styles.tooltip}>{tooltip.message}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
