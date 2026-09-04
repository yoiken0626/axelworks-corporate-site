import { Article } from '@/app/_libs/microcms';
import NewsListItem from '../NewsListItem';

type Props = {
  articles?: Article[];
  lang?: string;
};

export default function NewsList({ articles, lang }: Props) {
  if (!articles) {
    return null;
  }
  if (articles.length === 0) {
    return <p>記事がありません。</p>;
  }
  return (
    <ul>
      {articles.map((article) => (
        <NewsListItem key={article.id} news={article} lang={lang} />
      ))}
    </ul>
  );
}
