import { cookies } from 'next/headers';
import { getNewsList, localizedTitle } from '@/app/_libs/microcms';
import { NEWS_LIST_LIMIT } from '@/app/_constants';
import { LANG_COOKIE, resolveLang } from '@/app/_libs/lang';
import Pagination from '@/app/_components/Pagination';
import ArticleList from '@/app/_components/NewsList';
import PageReadAloud from '@/app/_components/PageReadAloud';

type Props = {
  params: Promise<{
    current: string;
  }>;
};

export default async function Page(props: Props) {
  const params = await props.params;
  const lang = resolveLang((await cookies()).get(LANG_COOKIE)?.value);
  const current = parseInt(params.current as string, 10);
  const data = await getNewsList({
    limit: NEWS_LIST_LIMIT,
    offset: NEWS_LIST_LIMIT * (current - 1),
  });

  const segments = data.contents.map((a) => localizedTitle(a, lang));

  return (
    <>
      <PageReadAloud lang={lang} segments={segments} />
      <ArticleList articles={data.contents} lang={lang} />
      <Pagination totalCount={data.totalCount} current={current} basePath="/news" />
    </>
  );
}
