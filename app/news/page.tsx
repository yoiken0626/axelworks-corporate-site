import { cookies } from 'next/headers';
import { getNewsList, localizedTitle } from '@/app/_libs/microcms';
import { NEWS_LIST_LIMIT } from '@/app/_constants';
import { LANG_COOKIE, resolveLang } from '@/app/_libs/lang';
import NewsList from '@/app/_components/NewsList';
import NewsListHeading from '@/app/_components/NewsListHeading';
import Pagination from '@/app/_components/Pagination';
import PageReadAloud from '@/app/_components/PageReadAloud';
import { SCROLL_DOCK_SENTINEL_ID } from '@/app/_libs/scroll-dock';

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
      <NewsListHeading lang={lang} />
      {/* 見出しの下端。ここが画面上端より上へ出たら地球儀・読み上げ UI を
          画面最上部へせり上げる（app/_libs/scroll-dock.ts）。 */}
      <div id={SCROLL_DOCK_SENTINEL_ID} aria-hidden="true" />
      <NewsList articles={data.contents} lang={lang} />
      <Pagination totalCount={data.totalCount} basePath="/news" lang={lang} />
    </>
  );
}
