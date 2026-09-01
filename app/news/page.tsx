import { getNewsList } from '@/app/_libs/microcms';
import { NEWS_LIST_LIMIT } from '@/app/_constants';
import NewsList from '@/app/_components/NewsList';
import Pagination from '@/app/_components/Pagination';
import GlobeLanguageSwitcher from '@/app/_components/GlobeLanguageSwitcher';
import styles from './page.module.css';

export default async function Page() {
  const data = await getNewsList({
    limit: NEWS_LIST_LIMIT,
  });
  return (
    <>
      <div className={styles.langSwitch}>
        <GlobeLanguageSwitcher />
      </div>
      <NewsList articles={data.contents} />
      <Pagination totalCount={data.totalCount} basePath="/news" />
    </>
  );
}
