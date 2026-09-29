import type { MicroCMSImage, MicroCMSDate, MicroCMSContentId } from 'microcms-js-sdk';
import { LANGUAGES, type TranslationSuffix } from './lang-registry';

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

// translation_status が「生成中」になった時刻（ISO 8601）。多重実行防止のロック取得時に
// 毎回打ち直す。処理が途中で落ちて「生成中」のまま固まった記事を、一定時間の経過で
// 検知して再試行するために使う（app/_libs/translate-pipeline.ts の STALE_GENERATING_MS）。
// microCMS側に日時フィールド（フィールドID: translation_started）の追加が必要。

// 翻訳対象言語（レジストリの TranslationSuffix）ごとの title_*/content_* フィールド。
// 言語を追加すると、対応する title_*/content_* がここに自動で増える。
export type TitleFields = { [K in TranslationSuffix as `title_${K}`]?: string };
export type ContentFields = { [K in TranslationSuffix as `content_${K}`]?: string };

// ニュースの型定義
export type News = {
  title: string;
  description: string;
  content: string;
  translation_status?: TranslationStatus[];
  translation_started?: string;
  thumbnail?: MicroCMSImage;
  category: Category;
} & TitleFields &
  ContentFields;

export type Article = News & MicroCMSContentId & MicroCMSDate;

// タイトルの多言語フィールドだけを持つ最小限の型。localizedTitle はこれだけで動く
// （News はこれを満たすので、そのまま渡せる）。
type TitleSource = Pick<News, 'title'> & TitleFields;

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
  thumbnail?: MicroCMSImage;
  category?: Category;
  publishedAt?: string;
  createdAt?: string;
} & TitleFields;

// 記事のタイトル / 本文を表示言語に合わせて返す。未翻訳（空）の場合は日本語にフォールバックする。
// レジストリの翻訳フィールドから自動生成する（言語を追加してもここを編集する必要はない）。
const TITLE_FIELD: Record<string, keyof TitleSource> = Object.fromEntries(
  LANGUAGES.flatMap((l) => (l.translationField ? [[l.code, `title_${l.translationField}`]] : [])),
);
const CONTENT_FIELD: Record<string, keyof News> = Object.fromEntries(
  LANGUAGES.flatMap((l) => (l.translationField ? [[l.code, `content_${l.translationField}`]] : [])),
);

export const localizedTitle = (article: TitleSource, lang: string): string =>
  (TITLE_FIELD[lang] && (article[TITLE_FIELD[lang]] as string | undefined)) || article.title;

export const localizedContent = (article: News, lang: string): string =>
  (CONTENT_FIELD[lang] && (article[CONTENT_FIELD[lang]] as string | undefined)) || article.content;

// まだ翻訳されていない対象言語（title_*/content_* のどちらかが空）を、レジストリの
// 翻訳対象言語一覧から動的に算出する。翻訳パイプライン（/api/translate-article）が、
// 「未翻訳の言語だけを翻訳する」「失敗した言語だけ再試行する」ために使う。
// 言語を追加しても固定のカウントを直す必要はない（レジストリの対象言語数がそのまま
// 使われる）。
export const missingTranslationLangs = (article: News): TranslationSuffix[] =>
  LANGUAGES.flatMap((l) => {
    if (!l.translationField) return [];
    const suffix = l.translationField as TranslationSuffix;
    const hasTitle = !!article[`title_${suffix}`];
    const hasContent = !!article[`content_${suffix}`];
    return hasTitle && hasContent ? [] : [suffix];
  });
