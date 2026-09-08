import Image from 'next/image';
import { formatRichText } from '@/app/_libs/utils';
import { buildToc, TOC_MIN_HEADINGS } from '@/app/_libs/toc';
import { type Article, localizedTitle, localizedContent } from '@/app/_libs/microcms';
import PublishedDate from '../Date';
import styles from './index.module.css';
import Category from '../Category';
import TableOfContents from '../TableOfContents';

type Props = {
  data: Article;
  lang?: string;
};

export default function Article({ data, lang }: Props) {
  const title = localizedTitle(data, lang ?? 'ja');
  const content = localizedContent(data, lang ?? 'ja');

  // 表示言語の本文から H2 / H3 を抽出し、見出しにアンカー ID を付与する。
  const { html, toc } = buildToc(formatRichText(content));
  const showToc = toc.length >= TOC_MIN_HEADINGS;

  return (
    // ランドマークの <main> は app/layout.tsx 側にあるので、ここは <div>（入れ子回避）
    <div>
      <h1 className={styles.title} data-read-aloud-title>{title}</h1>
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
      {showToc && <TableOfContents items={toc} lang={lang} />}
      <div
        className={styles.content}
        data-read-aloud-body
        dangerouslySetInnerHTML={{
          __html: html,
        }}
      />
    </div>
  );
}
