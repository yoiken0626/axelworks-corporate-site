import { cookies } from 'next/headers';
import { getNewsList, localizedTitle } from '@/app/_libs/microcms';
import { NEWS_LIST_LIMIT } from '@/app/_constants';
import { LANG_COOKIE, resolveLang } from '@/app/_libs/lang';
import NewsList from '@/app/_components/NewsList';
import Pagination from '@/app/_components/Pagination';
import PageReadAloud from '@/app/_components/PageReadAloud';

export default async function Page() {
  const lang = resolveLang((await cookies()).get(LANG_COOKIE)?.value);
  const data = await getNewsList({
    limit: NEWS_LIST_LIMIT,
  });

  // 読み上げ対象：記事タイトル一覧（表示言語に合わせる）
  const segments = data.contents.map((a) => localizedTitle(a, lang));

  return (
    <>
      <PageReadAloud lang={lang} segments={segments} />
      <NewsList articles={data.contents} lang={lang} />
      <Pagination totalCount={data.totalCount} basePath="/news" />
    </>
  );
}
