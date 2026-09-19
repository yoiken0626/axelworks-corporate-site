import { type NewsListEntry } from '@/app/_libs/news';
import NewsListItem from '../NewsListItem';
import styles from './index.module.css';

type Props = {
  articles?: NewsListEntry[];
  lang?: string;
  /** 'list'（既定・/news 一覧の横並び行）/ 'grid'（トップページのカードグリッド） */
  variant?: 'list' | 'grid';
};

// grid バリアントのうち、最初から画面に見える段（PC 4列の1行目）だけ優先読み込みする件数
const PRIORITY_COUNT = 4;

export default function NewsList({ articles, lang, variant = 'list' }: Props) {
  if (!articles) {
    return null;
  }
  if (articles.length === 0) {
    return <p>記事がありません。</p>;
  }
  return (
    <ul className={variant === 'grid' ? styles.grid : undefined}>
      {articles.map((article, index) => (
        <NewsListItem
          key={article.id}
          news={article}
          lang={lang}
          variant={variant}
          priority={variant === 'grid' && index < PRIORITY_COUNT}
        />
      ))}
    </ul>
  );
}
