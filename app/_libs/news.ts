import type { MicroCMSImage, MicroCMSDate, MicroCMSContentId } from 'microcms-js-sdk';

// 記事関連の型と表示言語解決ロジック。microCMS クライアントの初期化（サーバー専用の
// 環境変数チェックを含む）から切り離してある。NewsList/NewsListItem/NewsGrid は
// 'use client' 経由でブラウザにもバンドルされるため、ここを経由して型・関数だけを
// 取り込み、`app/_libs/microcms.ts`（サーバー専用）を巻き込まないようにする。

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
  title_ru?: string;
  content_ru?: string;
  translation_status?: TranslationStatus[];
  thumbnail?: MicroCMSImage;
  category: Category;
};

export type Article = News & MicroCMSContentId & MicroCMSDate;

// タイトルの多言語フィールドだけを持つ最小限の型。localizedTitle はこれだけで動く
// （News はこれを満たすので、そのまま渡せる）。
type TitleSource = Pick<News, 'title'> &
  Partial<
    Pick<News, 'title_en' | 'title_ko' | 'title_zh' | 'title_de' | 'title_fr' | 'title_es' | 'title_ru'>
  >;

// トップページのカードグリッド（NewsList variant="grid"）の描画に必要な最小限の項目。
// 「もっと見る」API（/api/news-more）のレスポンス項目そのもの。タイトルは呼び出し側
// （API側）で表示言語に解決済みの1本の文字列を返すので、ここでは多言語フィールドを持たない。
export type NewsCardData = {
  id: string;
  title: string;
  thumbnail?: MicroCMSImage;
};

// NewsList/NewsListItem の props 型。list バリアント（/news 一覧）は常に完全な Article を渡し、
// grid バリアント（トップページ）は初回分は Article、「もっと見る」で追加された分は
// NewsCardData を渡す。両方を受け付けられるよう、list バリアントだけが使う項目は任意にしてある。
export type NewsListEntry = {
  id: string;
  title: string;
  title_en?: string;
  title_ko?: string;
  title_zh?: string;
  title_de?: string;
  title_fr?: string;
  title_es?: string;
  title_ru?: string;
  thumbnail?: MicroCMSImage;
  category?: Category;
  publishedAt?: string;
  createdAt?: string;
};

// 記事のタイトル / 本文を表示言語に合わせて返す。未翻訳（空）の場合は日本語にフォールバックする。
const TITLE_FIELD: Record<string, keyof TitleSource> = {
  en: 'title_en',
  ko: 'title_ko',
  zh: 'title_zh',
  de: 'title_de',
  fr: 'title_fr',
  es: 'title_es',
  ru: 'title_ru',
};
const CONTENT_FIELD: Record<string, keyof News> = {
  en: 'content_en',
  ko: 'content_ko',
  zh: 'content_zh',
  de: 'content_de',
  fr: 'content_fr',
  es: 'content_es',
  ru: 'content_ru',
};

export const localizedTitle = (article: TitleSource, lang: string): string =>
  (TITLE_FIELD[lang] && (article[TITLE_FIELD[lang]] as string | undefined)) || article.title;

export const localizedContent = (article: News, lang: string): string =>
  (CONTENT_FIELD[lang] && (article[CONTENT_FIELD[lang]] as string | undefined)) || article.content;
