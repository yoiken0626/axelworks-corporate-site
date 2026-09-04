import Link from 'next/link';
import Image from 'next/image';
import { Article, localizedTitle } from '@/app/_libs/microcms';
import styles from './index.module.css';
import PublishedDate from '../Date';
import Category from '../Category';

type Props = {
  news: Article;
  lang?: string;
};

export default function NewsListItem({ news, lang }: Props) {
  return (
    <li className={styles.list}>
      <Link href={`/news/${news.id}`} className={styles.link}>
        {news.thumbnail ? (
          <Image
            src={news.thumbnail?.url}
            alt=""
            className={styles.image}
            width={news.thumbnail?.width}
            height={news.thumbnail?.height}
          />
        ) : (
          <Image
            className={styles.image}
            src="/no-image.png"
            alt="No Image"
            width={1200}
            height={630}
          />
        )}
        <dl className={styles.content}>
          <dt className={styles.title}>{localizedTitle(news, lang ?? 'ja')}</dt>
          <dd className={styles.meta}>
            <Category category={news.category} />
            <PublishedDate date={news.publishedAt || news.createdAt} />
          </dd>
        </dl>
      </Link>
    </li>
  );
}
