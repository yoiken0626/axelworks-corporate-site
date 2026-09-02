import Link from 'next/link';
import { ui } from '@/app/_libs/ui-strings';
import { type Lang } from '@/app/_libs/lang';
import styles from './index.module.css';

type Props = {
  lang: Lang;
};

export default function Footer({ lang }: Props) {
  return (
    <footer className={styles.footer}>
      <nav className={styles.nav}>
        <ul className={styles.items}>
          <li className={styles.item}>
            <Link href="/news">{ui('navNews', lang)}</Link>
          </li>
          <li className={styles.item}>
            <Link href="/members">{ui('navMembers', lang)}</Link>
          </li>
          <li className={styles.item}>
            <Link href="">{ui('navCareers', lang)}</Link>
          </li>
          <li className={styles.item}>
            <Link href="/#contact-form">{ui('navContact', lang)}</Link>
          </li>
        </ul>
      </nav>
      <p>{ui('footerCopyright', lang)}</p>
    </footer>
  );
}
