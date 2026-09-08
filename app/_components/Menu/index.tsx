'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import cx from 'classnames';
import { ui } from '@/app/_libs/ui-strings';
import { type Lang } from '@/app/_libs/lang';
import styles from './index.module.css';

type Props = {
  lang: Lang;
};

const MENU_ID = 'primary-menu';

export default function Menu({ lang }: Props) {
  const [isOpen, setOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const openButtonRef = useRef<HTMLButtonElement>(null);

  const open = () => setOpen(true);
  // 閉じたらハンバーガーボタンにフォーカスを戻す（キーボード操作の迷子防止）
  const close = () => {
    setOpen(false);
    openButtonRef.current?.focus();
  };
  // リンク遷移で閉じる場合はフォーカス復帰不要（遷移先へ移る）
  const closeForNav = () => setOpen(false);

  // 開いている間: 先頭要素へフォーカス移動 / Esc で閉じる / Tab をメニュー内に閉じ込める
  useEffect(() => {
    if (!isOpen) return;
    const nav = navRef.current;
    if (!nav) return;

    const focusables = () =>
      Array.from(nav.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'));

    focusables()[0]?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  return (
    <div>
      <nav
        id={MENU_ID}
        ref={navRef}
        className={cx(styles.nav, isOpen && styles.open)}
        aria-label={ui('navMain', lang)}
      >
        <ul className={styles.items}>
          <li>
            <Link href="/news" onClick={closeForNav}>
              {ui('navNews', lang)}
            </Link>
          </li>
          <li>
            <Link href="/business" onClick={closeForNav}>
              {ui('navBusiness', lang)}
            </Link>
          </li>
          <li>
            <Link href="/members" onClick={closeForNav}>
              {ui('navMembers', lang)}
            </Link>
          </li>
          <li>
            <Link href="" onClick={closeForNav}>
              {ui('navCareers', lang)}
            </Link>
          </li>
          <li>
            <Link href="/#contact-form" onClick={closeForNav}>
              {ui('navContact', lang)}
            </Link>
          </li>
        </ul>
        <button
          type="button"
          className={cx(styles.button, styles.close)}
          onClick={close}
          aria-label={ui('menuClose', lang)}
        >
          <Image src="/close.svg" alt="" width={24} height={24} priority />
        </button>
      </nav>
      <button
        type="button"
        ref={openButtonRef}
        className={styles.button}
        onClick={open}
        aria-label={ui('menuOpen', lang)}
        aria-expanded={isOpen}
        aria-controls={MENU_ID}
      >
        <Image src="/menu.svg" alt="" width={24} height={24} priority />
      </button>
    </div>
  );
}
