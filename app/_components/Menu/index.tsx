'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import cx from 'classnames';
import { ui } from '@/app/_libs/ui-strings';
import { type Lang } from '@/app/_libs/lang';
import styles from './index.module.css';

type Props = {
  lang: Lang;
};

export default function Menu({ lang }: Props) {
  const [isOpen, setOpen] = useState<boolean>(false);
  const open = () => setOpen(true);
  const close = () => setOpen(false);
  return (
    <div>
      <nav className={cx(styles.nav, isOpen && styles.open)}>
        <ul className={styles.items}>
          <li>
            <Link href="/news" onClick={close}>
              {ui('navNews', lang)}
            </Link>
          </li>
          <li>
            <Link href="/business" onClick={close}>
              {ui('navBusiness', lang)}
            </Link>
          </li>
          <li>
            <Link href="/members" onClick={close}>
              {ui('navMembers', lang)}
            </Link>
          </li>
          <li>
            <Link href="" onClick={close}>
              {ui('navCareers', lang)}
            </Link>
          </li>
          <li>
            <Link href="/#contact-form" onClick={close}>
              {ui('navContact', lang)}
            </Link>
          </li>
        </ul>
        <button className={cx(styles.button, styles.close)} onClick={close}>
          <Image src="/close.svg" alt="閉じる" width={24} height={24} priority />
        </button>
      </nav>
      <button className={styles.button} onClick={open} aria-label="メニューを開く">
        <Image src="/menu.svg" alt="メニュー" width={24} height={24} priority />
      </button>
    </div>
  );
}
