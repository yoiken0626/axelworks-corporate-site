import { Metadata } from 'next';
import { cookies } from 'next/headers';
import { getNewsDetail } from '@/app/_libs/microcms';
import Article from '@/app/_components/Article';
import { LANG_COOKIE, resolveLang } from '@/app/_libs/lang';
import styles from './page.module.css';
import ButtonLink from '@/app/_components/ButtonLink';
import GlobeLanguageSwitcher from '@/app/_components/GlobeLanguageSwitcher';

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

  const title = (lang === 'en' && data.title_en) || data.title;

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
  return (
    <>
      <div className={styles.langSwitch}>
        <GlobeLanguageSwitcher />
      </div>
      <Article data={data} lang={lang} dk={searchParams.dk} />
      <div className={styles.footer}>
        <ButtonLink href="/news">ニュース一覧へ</ButtonLink>
      </div>
    </>
  );
}
