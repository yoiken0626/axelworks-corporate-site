import Link from 'next/link';
import styles from './index.module.css';
import { NEWS_LIST_LIMIT } from '@/app/_constants';
import { ui } from '@/app/_libs/ui-strings';
import { type Lang } from '@/app/_libs/lang';

type Props = {
  totalCount: number;
  current?: number;
  basePath?: string;
  q?: string;
  lang?: Lang;
};

export default function Pagination({ totalCount, current = 1, basePath = '', q, lang }: Props) {
  const pages = Array.from({ length: Math.ceil(totalCount / NEWS_LIST_LIMIT) }).map(
    (_, i) => i + 1,
  );
  const pageLabel = (p: number) => ui('paginationPage', lang).replace('{n}', String(p));

  return (
    <nav aria-label={ui('paginationLabel', lang)}>
      <ul className={styles.container}>
        {pages.map((p) => (
          <li className={styles.list} key={p}>
            {current !== p ? (
              <Link
                href={`${basePath}/p/${p}` + (q ? `?q=${q}` : '')}
                className={styles.item}
                aria-label={pageLabel(p)}
              >
                {p}
              </Link>
            ) : (
              <span
                className={`${styles.item} ${styles.current}`}
                aria-current="page"
                aria-label={pageLabel(p)}
              >
                {p}
              </span>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
