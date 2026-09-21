'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import classNames from 'classnames';
import { ui } from '@/app/_libs/ui-strings';
import { setLangCookie, type Lang } from '@/app/_libs/lang';
import styles from './index.module.css';

// three.js は重いので遅延ロード。地球儀はハイドレーション後にクライアントで描画する。
const Earth3D = dynamic(() => import('./Earth3D'), { ssr: false });

type Flag = {
  code: string;
  // public/flags/<icon>.svg（circle-flags 由来の円形SVG。ISO 3166-1 alpha-2）
  icon: string;
  label: string;
  lang: Lang;
};

// 8言語すべてに対応（SUPPORTED_LANGS と同じ並び）
const FLAGS: Flag[] = [
  { code: 'ja', icon: 'jp', label: '日本語', lang: 'ja' },
  { code: 'en', icon: 'us', label: 'English', lang: 'en' },
  { code: 'ko', icon: 'kr', label: '한국어', lang: 'ko' },
  { code: 'zh', icon: 'cn', label: '中文', lang: 'zh' },
  { code: 'de', icon: 'de', label: 'Deutsch', lang: 'de' },
  { code: 'fr', icon: 'fr', label: 'Français', lang: 'fr' },
  { code: 'es', icon: 'es', label: 'Español', lang: 'es' },
  { code: 'ru', icon: 'ru', label: 'Русский', lang: 'ru' },
];

// 国旗リングは地球儀(ルート要素)の中心を基準に等角で円状に配置する。
// 中心からの距離は CSS 変数 --gls-ring-radius で調整可能(既定はルート幅の125%)。
const RING_START_ANGLE = -90; // 真上から時計回り

const getFlagOffset = (index: number, total: number) => {
  const angle = ((RING_START_ANGLE + (360 / total) * index) * Math.PI) / 180;
  return { cos: Math.cos(angle).toFixed(4), sin: Math.sin(angle).toFixed(4) };
};

type Props = {
  className?: string;
  /** 現在の表示言語。閉じているときのバッジ表示・国旗リングの現在地印・aria-label に使う */
  lang: Lang;
};

export default function GlobeLanguageSwitcher({ className, lang }: Props) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const currentIndex = FLAGS.findIndex((f) => f.lang === lang);
  const currentFlag = FLAGS[currentIndex >= 0 ? currentIndex : 0];

  const closeMenu = (refocusButton: boolean) => {
    setIsOpen(false);
    if (refocusButton) buttonRef.current?.focus();
  };

  const handleLangSelect = (flag: Flag) => {
    // 閉じる操作とフォーカスは同期的に行う（iOS Safari 等でのユーザー操作直後の
    // 制約に配慮し、setTimeout 等は挟まない）。
    setIsOpen(false);
    buttonRef.current?.focus();
    if (flag.lang === lang) {
      // 既に選択中の言語を選び直したときは Cookie 書き換え・再取得をしない
      return;
    }
    setLangCookie(flag.lang);
    router.refresh();
  };

  // 開いたら、現在の言語（無ければ先頭）の国旗にフォーカスする
  useEffect(() => {
    if (!isOpen) return;
    const idx = currentIndex >= 0 ? currentIndex : 0;
    itemRefs.current[idx]?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // 外側タップ / Esc / Tab / 矢印キーでの移動
  useEffect(() => {
    if (!isOpen) return;

    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      closeMenu(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeMenu(true);
        return;
      }
      if (e.key === 'Tab') {
        // メニューの外へフォーカスが移るので、開いたままにしない
        closeMenu(false);
        return;
      }
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowDown' && e.key !== 'ArrowLeft' && e.key !== 'ArrowUp') {
        return;
      }
      const items = itemRefs.current.filter((el): el is HTMLButtonElement => el != null);
      if (items.length === 0) return;
      e.preventDefault();
      const activeIndex = items.findIndex((el) => el === document.activeElement);
      const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
      const nextIndex = (activeIndex + delta + items.length) % items.length;
      items[nextIndex]?.focus();
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const switcherLabel = ui('globeLanguageSwitcherLabel', lang).replace('{lang}', currentFlag.label);

  return (
    <div ref={rootRef} className={classNames(styles.root, className)}>
      <button
        type="button"
        ref={buttonRef}
        className={styles.globeButton}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={switcherLabel}
      >
        <Earth3D className={styles.earthGlobe} />
      </button>

      {/* 閉じている間だけ見せる、現在の言語の丸国旗バッジ。地球儀に重ねる装飾のため
         非インタラクティブにする（タップは背後の globeButton がまとめて受け取る）。 */}
      <div className={styles.currentBadge} data-open={isOpen} aria-hidden="true">
        <span className={styles.currentBadgeFlagWrap}>
          <Image
            src={`/flags/${currentFlag.icon}.svg`}
            alt=""
            width={28}
            height={28}
            className={styles.currentBadgeFlag}
          />
        </span>
        <span className={styles.currentBadgeCode}>{currentFlag.code.toUpperCase()}</span>
      </div>

      <ul
        className={styles.flagList}
        role="menu"
        aria-label={ui('globeLanguageMenuHeading', lang)}
        aria-hidden={!isOpen}
      >
        {FLAGS.map((flag, index) => {
          const { cos, sin } = getFlagOffset(index, FLAGS.length);
          const isCurrent = flag.lang === lang;
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
                ref={(el) => {
                  itemRefs.current[index] = el;
                }}
                className={styles.flagButton}
                role="menuitemradio"
                aria-checked={isCurrent}
                aria-label={flag.label}
                title={flag.label}
                tabIndex={-1}
                data-current={isCurrent}
                onClick={() => handleLangSelect(flag)}
              >
                <Image
                  src={`/flags/${flag.icon}.svg`}
                  alt=""
                  width={48}
                  height={48}
                  className={styles.flagIcon}
                />
                {isCurrent && (
                  <span className={styles.checkMark} aria-hidden="true">
                    ✓
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
