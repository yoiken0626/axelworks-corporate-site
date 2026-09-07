import { ui } from '@/app/_libs/ui-strings';
import type { TocItem } from '@/app/_libs/toc';
import styles from './index.module.css';

type Props = {
  items: TocItem[];
  lang?: string;
};

/**
 * 記事詳細ページの目次。タイトル直下・本文より前に固定表示する。
 * 見出しへのジャンプは通常のフラグメントリンク（#section-N）で、
 * スムーズスクロールは globals.css の `scroll-behavior: smooth` に任せる。
 * 表示条件（見出し数）は呼び出し側で判定する。
 */
export default function TableOfContents({ items, lang }: Props) {
  const heading = ui('tocHeading', lang ?? 'ja');

  return (
    <nav className={styles.toc} aria-label={heading}>
      <p className={styles.heading}>{heading}</p>
      <ol className={styles.list}>
        {items.map((item) => (
          <li key={item.id} className={item.level === 3 ? styles.sub : styles.item}>
            <a href={`#${item.id}`} className={styles.link}>
              {item.text}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
