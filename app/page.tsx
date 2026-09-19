import { Metadata } from 'next';
import { cookies } from 'next/headers';
import { getNewsList, localizedTitle } from '@/app/_libs/microcms';
import { TOP_NEWS_LIMIT } from '@/app/_constants';
import { LANG_COOKIE, resolveLang } from '@/app/_libs/lang';
import { ui } from '@/app/_libs/ui-strings';
import NewsGrid from '@/app/_components/NewsGrid';
import styles from './page.module.css';
import TopReadAloud from '@/app/_components/TopReadAloud';

// ルートlayout.tsxはmicroCMSの「meta」エンドポイントからtitleを取得するが、
// 現状そのコンテンツタイプが無く空になるため、トップページ独自のmetadataで
// 確実に <title>AXelWorks</title> が出るようにする（layout側のgetMeta()呼び出しは
// 変更しない。将来「meta」を用意すればそちらが優先される）。
export const metadata: Metadata = {
  title: 'AXelWorks',
  description: 'AIとともに、多言語で世界とつながる',
  openGraph: {
    title: 'AXelWorks',
    description: 'AIとともに、多言語で世界とつながる',
  },
};

export default async function Page() {
  const cookieStore = await cookies();
  const lang = resolveLang(cookieStore.get(LANG_COOKIE)?.value);
  const data = await getNewsList({
    limit: TOP_NEWS_LIMIT,
    orders: '-publishedAt',
  });

  // ヒーローの吹き出し：最新記事（公開日が最も新しい1件）のタイトルへのリンク
  const latest = data.contents[0];
  const latestNews = latest
    ? { slug: latest.id, title: localizedTitle(latest, lang) }
    : null;

  // 読み上げ対象：ヒーロー＋Newsセクションの見出しと記事タイトル（初回表示分のみ）。
  // 以前はこの下に Business/About us/Hire me の文言も読み上げていたが、各セクションを
  // トップページの構成から外した（別ページ化）ため読み上げ対象からも外した。
  // 「もっと見る」で追加された記事は読み上げ対象外（仕様どおり）。
  const newsTitles = data.contents.map((a) => localizedTitle(a, lang));
  const readSegments = [ui('newsHeading', lang), ...newsTitles];

  return (
    <>
      <section className={styles.top}>
        <TopReadAloud lang={lang} segments={readSegments} latestNews={latestNews} />
      </section>
      <section className={styles.news} data-read-aloud-body>
        <h2 className={styles.newsTitle}>{ui('newsHeading', lang)}</h2>
        <NewsGrid initialArticles={data.contents} lang={lang} totalCount={data.totalCount} />
      </section>
    </>
  );
}
