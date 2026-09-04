import { createClient } from 'microcms-js-sdk';
import type { News } from './microcms';

// 書き込み専用クライアント。
// title_en/ko / content_en/ko / translation_status の更新にのみ使用する。
// PATCH権限のみを付与した、閲覧用(MICROCMS_API_KEY)とは別のAPIキーを想定している。
// フロント表示に使う app/_libs/microcms.ts とは分離し、
// このモジュールを読み込まないページのビルドがMICROCMS_MANAGEMENT_API_KEY未設定で
// 失敗しないようにしている。
let writeClient: ReturnType<typeof createClient> | undefined;

const getWriteClient = () => {
  if (writeClient) {
    return writeClient;
  }

  if (!process.env.MICROCMS_SERVICE_DOMAIN) {
    throw new Error('MICROCMS_SERVICE_DOMAIN is required');
  }

  if (!process.env.MICROCMS_MANAGEMENT_API_KEY) {
    throw new Error('MICROCMS_MANAGEMENT_API_KEY is required');
  }

  writeClient = createClient({
    serviceDomain: process.env.MICROCMS_SERVICE_DOMAIN,
    apiKey: process.env.MICROCMS_MANAGEMENT_API_KEY,
  });

  return writeClient;
};

type NewsTranslationFields = Partial<
  Pick<News, 'title_en' | 'content_en' | 'title_ko' | 'content_ko' | 'translation_status'>
>;

// ニュース記事の翻訳関連フィールドをPATCHで更新する
export const updateNewsTranslation = async (contentId: string, fields: NewsTranslationFields) => {
  await getWriteClient().update({
    endpoint: 'news',
    contentId,
    content: fields,
  });
};
