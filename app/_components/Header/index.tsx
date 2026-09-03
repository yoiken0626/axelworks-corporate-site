'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Menu from '@/app/_components/Menu';
import { type Lang } from '@/app/_libs/lang';
import styles from './index.module.css';

type Props = {
  lang: Lang;
};

export default function Header({ lang }: Props) {
  // トップページの最上部と、ヒーローバナーを廃止したニュースページは明るい背景。
  // それ以外（business / members）は暗いヒーロー画像なので、ナビ・ロゴの色を出し分ける。
  const pathname = usePathname();
  const isLightBg = pathname === '/' || pathname === '/news' || pathname.startsWith('/news/');
  const variant = isLightBg ? 'light' : 'dark';

  return (
    <header className={styles.header} data-variant={variant}>
      <Link href="/" className={styles.logoLink} aria-label="AXelWorks">
        <span className={styles.logo}>
          AX<span className={styles.logoSuffix}>elWorks</span>
        </span>
      </Link>
      <Menu lang={lang} />
    </header>
  );
}
