import { createClient } from 'microcms-js-sdk';
import type {
  MicroCMSQueries,
  MicroCMSImage,
  MicroCMSDate,
  MicroCMSContentId,
} from 'microcms-js-sdk';
import { notFound } from 'next/navigation';

// カテゴリーの型定義
export type Category = {
  name: string;
} & MicroCMSContentId &
  MicroCMSDate;

// 翻訳ステータスの型定義
export type TranslationStatus = '未処理' | '生成中' | '完了';

// ニュースの型定義
export type News = {
  title: string;
  description: string;
  content: string;
  title_en?: string;
  content_en?: string;
  title_ko?: string;
  content_ko?: string;
  title_zh?: string;
  content_zh?: string;
  title_de?: string;
  content_de?: string;
  title_fr?: string;
  content_fr?: string;
  title_es?: string;
  content_es?: string;
  translation_status?: TranslationStatus[];
  thumbnail?: MicroCMSImage;
  category: Category;
};

// メンバーの型定義
export type Member = {
  name: string;
  position: string;
  profile: string;
  image?: MicroCMSImage;
};

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

export type Article = News & MicroCMSContentId & MicroCMSDate;

// 記事のタイトル / 本文を表示言語に合わせて返す。未翻訳（空）の場合は日本語にフォールバックする。
const TITLE_FIELD: Record<string, keyof News> = {
  en: 'title_en',
  ko: 'title_ko',
  zh: 'title_zh',
  de: 'title_de',
  fr: 'title_fr',
  es: 'title_es',
};
const CONTENT_FIELD: Record<string, keyof News> = {
  en: 'content_en',
  ko: 'content_ko',
  zh: 'content_zh',
  de: 'content_de',
  fr: 'content_fr',
  es: 'content_es',
};

export const localizedTitle = (article: News, lang: string): string =>
  (TITLE_FIELD[lang] && (article[TITLE_FIELD[lang]] as string | undefined)) || article.title;

export const localizedContent = (article: News, lang: string): string =>
  (CONTENT_FIELD[lang] && (article[CONTENT_FIELD[lang]] as string | undefined)) || article.content;

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

// メンバー一覧を取得
export const getMembersList = async (queries?: MicroCMSQueries) => {
  const listData = await client
    .getList<Member>({
      endpoint: 'members',
      queries,
    })
    .catch(notFound);
  return listData;
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
