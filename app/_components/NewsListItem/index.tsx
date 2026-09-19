import Link from 'next/link';
import Image from 'next/image';
import { type NewsListEntry, localizedTitle } from '@/app/_libs/news';
import styles from './index.module.css';
import PublishedDate from '../Date';
import Category from '../Category';

type Props = {
  news: NewsListEntry;
  lang?: string;
  /** 'list'（既定・/news 一覧の横並び行）/ 'grid'（トップページのカードグリッド） */
  variant?: 'list' | 'grid';
  /** grid バリアントで、画面に最初から見える段のサムネイルを優先読み込みするか */
  priority?: boolean;
};

// grid バリアントのサムネイルは PC 4列 / タブレット・スマホ 2列で表示するので、
// 実際の表示幅に近いサイズを next/image に伝えて配信画像を軽くする。
const GRID_IMAGE_SIZES = '(max-width: 1000px) 50vw, 25vw';

export default function NewsListItem({ news, lang, variant = 'list', priority = false }: Props) {
  const title = localizedTitle(news, lang ?? 'ja');

  if (variant === 'grid') {
    // note の記事カードのような「サムネイル＋タイトルのみ」のカード。
    // タイトルが画像のすぐ下にあるため alt は空にして読み上げの重複を避ける。
    return (
      <li className={styles.cardItem}>
        <Link href={`/news/${news.id}`} className={styles.cardLink}>
          {news.thumbnail ? (
            <Image
              src={news.thumbnail.url}
              alt=""
              className={styles.cardImage}
              width={news.thumbnail.width}
              height={news.thumbnail.height}
              sizes={GRID_IMAGE_SIZES}
              priority={priority}
              loading={priority ? undefined : 'lazy'}
            />
          ) : (
            <Image
              className={styles.cardImage}
              src="/no-image.png"
              alt=""
              width={1200}
              height={630}
              sizes={GRID_IMAGE_SIZES}
              priority={priority}
              loading={priority ? undefined : 'lazy'}
            />
          )}
          <p className={styles.cardTitle}>{title}</p>
        </Link>
      </li>
    );
  }

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
          <dt className={styles.title}>{title}</dt>
          <dd className={styles.meta}>
            <Category category={news.category} />
            <PublishedDate date={news.publishedAt || news.createdAt || ''} />
          </dd>
        </dl>
      </Link>
    </li>
  );
}
