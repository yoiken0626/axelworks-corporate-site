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
  // トップページの最上部と、ヒーローバナーを持たない下層ページ（ニュース／事業内容／
  // 私たちについて／私を採用情報／利用規約／個人情報保護方針）は明るい背景。
  // ナビ・ロゴの色を出し分ける。
  const pathname = usePathname();
  const isLightBg =
    pathname === '/' ||
    pathname === '/news' ||
    pathname.startsWith('/news/') ||
    pathname === '/business' ||
    pathname === '/company' ||
    pathname === '/hire-me' ||
    pathname === '/terms' ||
    pathname === '/privacy';
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
