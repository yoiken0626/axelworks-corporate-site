import Image from 'next/image';
import { formatRichText } from '@/app/_libs/utils';
import { type Article } from '@/app/_libs/microcms';
import PublishedDate from '../Date';
import styles from './index.module.css';
import Category from '../Category';

type Props = {
  data: Article;
  lang?: string;
};

export default function Article({ data, lang }: Props) {
  const isEn = lang === 'en';
  // 英語表示時はtitle_en/content_enを優先し、未翻訳の場合は日本語にフォールバックする
  const title = (isEn && data.title_en) || data.title;
  const content = (isEn && data.content_en) || data.content;

  return (
    <main>
      <h1 className={styles.title}>{title}</h1>
      <div className={styles.meta}>
        <Category category={data.category} />
        <PublishedDate date={data.publishedAt || data.createdAt} />
      </div>
      {data.thumbnail && (
        <Image
          src={data.thumbnail?.url}
          alt=""
          className={styles.thumbnail}
          width={data.thumbnail?.width}
          height={data.thumbnail?.height}
        />
      )}
      <div
        className={styles.content}
        dangerouslySetInnerHTML={{
          __html: `${formatRichText(content)}`,
        }}
      />
    </main>
  );
}
