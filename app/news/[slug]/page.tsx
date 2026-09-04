import { Metadata } from 'next';
import { cookies } from 'next/headers';
import { getNewsDetail, localizedTitle, localizedContent } from '@/app/_libs/microcms';
import Article from '@/app/_components/Article';
import { LANG_COOKIE, resolveLang } from '@/app/_libs/lang';
import { ui } from '@/app/_libs/ui-strings';
import { htmlToPlainText } from '@/app/_libs/utils';
import styles from './page.module.css';
import ButtonLink from '@/app/_components/ButtonLink';
import PageReadAloud from '@/app/_components/PageReadAloud';

type Props = {
  params: Promise<{
    slug: string;
  }>;
  searchParams: Promise<{
    dk: string;
    lang?: string;
  }>;
};

export async function generateMetadata(props: Props): Promise<Metadata> {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const cookieStore = await cookies();
  const lang = resolveLang(searchParams.lang ?? cookieStore.get(LANG_COOKIE)?.value);
  const data = await getNewsDetail(params.slug, {
    draftKey: searchParams.dk,
  });

  const title = localizedTitle(data, lang);

  return {
    title,
    description: data.description,
    openGraph: {
      title,
      description: data.description,
      images: [data?.thumbnail?.url || ''],
    },
    alternates: {
      canonical: `/news/${params.slug}`,
    },
  };
}

export default async function Page(props: Props) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const cookieStore = await cookies();
  const lang = resolveLang(searchParams.lang ?? cookieStore.get(LANG_COOKIE)?.value);
  const data = await getNewsDetail(params.slug, {
    draftKey: searchParams.dk,
  });

  // 読み上げ対象：記事タイトル＋本文（表示言語に合わせる。未翻訳なら日本語）
  const title = localizedTitle(data, lang);
  const content = localizedContent(data, lang);
  const segments = [title, htmlToPlainText(content || '')].filter(Boolean);

  return (
    <>
      <PageReadAloud lang={lang} segments={segments} />
      <Article data={data} lang={lang} />
      <div className={styles.footer}>
        <ButtonLink href="/news">{ui('newsListLink', lang)}</ButtonLink>
      </div>
    </>
  );
}
