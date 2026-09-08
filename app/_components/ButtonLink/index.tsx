import Link from 'next/link';
import { ui } from '@/app/_libs/ui-strings';
import { type Lang } from '@/app/_libs/lang';
import styles from './index.module.css';

type Props = {
  href: string;
  children: React.ReactNode;
  isExternal?: boolean;
  /** isExternal のとき「新しいタブで開く」注記を表示言語で出すために使う */
  lang?: Lang;
};

export default function ButtonLink({ href, children, isExternal = false, lang }: Props) {
  if (isExternal) {
    return (
      <a href={href} className={styles.button} target="_blank" rel="noopener noreferrer">
        {children}
        <span className="srOnly"> {ui('opensInNewTab', lang)}</span>
      </a>
    );
  }
  return (
    <Link href={href} className={styles.button}>
      {children}
    </Link>
  );
}
