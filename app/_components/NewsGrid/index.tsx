'use client';

import { useState } from 'react';
import { type Lang } from '@/app/_libs/lang';
import { ui } from '@/app/_libs/ui-strings';
import { type NewsListEntry, type NewsCardData } from '@/app/_libs/news';
import { LOAD_MORE_COUNT } from '@/app/_constants';
import NewsList from '@/app/_components/NewsList';
import styles from './index.module.css';

type Props = {
  initialArticles: NewsListEntry[];
  lang: Lang;
  totalCount: number;
};

type Status = 'idle' | 'loading' | 'error';

// トップページの記事カードグリッド＋「もっと見る」。初回表示分はサーバーから props で
// 受け取り、以降は /api/news-more から offset/limit ベースで追記する（並び順は
// 初回と同じ -publishedAt なので重複・抜けは出ない）。
export default function NewsGrid({ initialArticles, lang, totalCount }: Props) {
  const [articles, setArticles] = useState<NewsListEntry[]>(initialArticles);
  const [status, setStatus] = useState<Status>('idle');
  const [announcement, setAnnouncement] = useState('');

  const hasMore = articles.length < totalCount;

  const loadMore = async () => {
    if (status === 'loading') {
      return;
    }
    setStatus('loading');
    setAnnouncement('');
    try {
      const params = new URLSearchParams({
        offset: String(articles.length),
        limit: String(LOAD_MORE_COUNT),
        lang,
      });
      const res = await fetch(`/api/news-more?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`request failed: ${res.status}`);
      }
      const data: { articles: NewsCardData[]; totalCount: number } = await res.json();
      setArticles((prev) => [...prev, ...data.articles]);
      setStatus('idle');
      setAnnouncement(
        ui('loadMoreAnnouncement', lang).replace('{n}', String(data.articles.length)),
      );
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[NewsGrid] failed to load more articles', error);
      setStatus('error');
    }
  };

  return (
    <>
      <NewsList articles={articles} lang={lang} variant="grid" />
      {hasMore && (
        <div className={styles.loadMore}>
          <button
            type="button"
            className={styles.button}
            onClick={() => {
              if (status !== 'loading') {
                loadMore();
              }
            }}
            aria-disabled={status === 'loading'}
            aria-busy={status === 'loading'}
          >
            {status === 'loading' ? ui('loadMoreLoading', lang) : ui('seeMore', lang)}
          </button>
          {status === 'error' && (
            <p className={styles.error} role="alert">
              {ui('loadMoreError', lang)}
            </p>
          )}
        </div>
      )}
      <p className="srOnly" role="status" aria-live="polite">
        {announcement}
      </p>
    </>
  );
}
