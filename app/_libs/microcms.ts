import { createClient } from 'microcms-js-sdk';
import type { MicroCMSQueries, MicroCMSImage } from 'microcms-js-sdk';
import { notFound } from 'next/navigation';

// 型・表示言語解決ロジック（サーバー専用の初期化を含まない）は app/_libs/news.ts に
// 分離してある。ここではサーバー専用のクライアント初期化・取得関数だけを持ち、
// 既存の呼び出し元（`from '@/app/_libs/microcms'`）が変更なしで使えるよう再エクスポートする。
export type { Category, TranslationStatus, News, Article, NewsCardData, NewsListEntry } from './news';
export { localizedTitle, localizedContent } from './news';
import type { News, Category } from './news';

// 事業内容の型定義
export type Business = {
  logo?: MicroCMSImage;
  description: string;
  image?: MicroCMSImage;
  link: string;
};

// メタ情報の型定義
export type Meta = {
  title?: string;
  description?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: MicroCMSImage;
  canonical?: string;
};

if (!process.env.MICROCMS_SERVICE_DOMAIN) {
  throw new Error('MICROCMS_SERVICE_DOMAIN is required');
}

if (!process.env.MICROCMS_API_KEY) {
  throw new Error('MICROCMS_API_KEY is required');
}

// Initialize Client SDK.
export const client = createClient({
  serviceDomain: process.env.MICROCMS_SERVICE_DOMAIN,
  apiKey: process.env.MICROCMS_API_KEY,
});

// ニュース一覧を取得
export const getNewsList = async (queries?: MicroCMSQueries) => {
  const listData = await client
    .getList<News>({
      endpoint: 'news',
      queries,
    })
    .catch(notFound);
  return listData;
};

// ニュースの詳細を取得
export const getNewsDetail = async (contentId: string, queries?: MicroCMSQueries) => {
  const detailData = await client
    .getListDetail<News>({
      endpoint: 'news',
      contentId,
      queries,
    })
    .catch(notFound);

  return detailData;
};

// カテゴリーの一覧を取得
export const getCategoryList = async (queries?: MicroCMSQueries) => {
  const listData = await client
    .getList<Category>({
      endpoint: 'categories',
      queries,
    })
    .catch(notFound);

  return listData;
};

// カテゴリーの詳細を取得
export const getCategoryDetail = async (contentId: string, queries?: MicroCMSQueries) => {
  const detailData = await client
    .getListDetail<Category>({
      endpoint: 'categories',
      contentId,
      queries,
    })
    .catch(notFound);

  return detailData;
};

// 事業内容一覧を取得
export const getBusinessList = async (queries?: MicroCMSQueries) => {
  const listData = await client
    .getList<Business>({
      endpoint: 'business',
      queries,
    })
    .catch(notFound);
  return listData;
};

// メタ情報を取得
export const getMeta = async (queries?: MicroCMSQueries) => {
  const data = await client
    .getObject<Meta>({
      endpoint: 'meta',
      queries,
    })
    .catch(() => null);

  return data;
};
