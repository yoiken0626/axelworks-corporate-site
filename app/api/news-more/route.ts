import { NextRequest, NextResponse } from 'next/server';
import { client, localizedTitle, type News, type NewsCardData } from '@/app/_libs/microcms';
import { resolveLang } from '@/app/_libs/lang';
import { LOAD_MORE_COUNT } from '@/app/_constants';

// 1回のリクエストで取得できる上限（無制限に大きい limit を渡されるのを防ぐ）
const MAX_LIMIT = 50;

// トップページの「もっと見る」用の窓口。ブラウザには microCMS の API キー／サービス
// ドメインを渡さず、必要な項目（id・表示言語のタイトル・サムネイル）だけに絞って返す。
// 並び順は初回表示（app/page.tsx）と同じ -publishedAt にして続きが欠けたり重複したり
// しないようにする。
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const offsetParam = Number(searchParams.get('offset'));
  const offset = Number.isFinite(offsetParam) && offsetParam >= 0 ? Math.floor(offsetParam) : 0;

  const limitParam = Number(searchParams.get('limit'));
  const limit =
    Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(Math.floor(limitParam), MAX_LIMIT)
      : LOAD_MORE_COUNT;

  const lang = resolveLang(searchParams.get('lang') ?? undefined);

  // fields で表示に必要な項目だけに絞る（表示言語のタイトルフィールドのみ、他言語は含めない）
  const fields = lang === 'ja' ? 'id,title,thumbnail' : `id,title,title_${lang},thumbnail`;

  try {
    const data = await client.getList<News>({
      endpoint: 'news',
      queries: { offset, limit, orders: '-publishedAt', fields },
    });

    const articles: NewsCardData[] = data.contents.map((item) => ({
      id: item.id,
      title: localizedTitle(item, lang),
      thumbnail: item.thumbnail,
    }));

    return NextResponse.json({ articles, totalCount: data.totalCount });
  } catch (error) {
    console.error('[news-more] failed to fetch articles', error);
    return NextResponse.json(
      { status: 'error', message: 'failed to fetch articles' },
      { status: 500 },
    );
  }
}
