import { cookies } from 'next/headers';
import Hero from '@/app/_components/Hero';
import Sheet from '@/app/_components/Sheet';
import { LANG_COOKIE, resolveLang } from '@/app/_libs/lang';
import { ui } from '@/app/_libs/ui-strings';

// ヘッダー/フッターやニュース本文が lang Cookie で切り替わるため、CDN キャッシュを無効化する。
// これが無いと Vercel が Cookie を無視して s-maxage=60 でキャッシュし、英語表示にならない。
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'ニュース｜シンプルなコーポレートサイト',
  openGraph: {
    title: 'ニュース｜シンプルなコーポレートサイト',
  },
  alternates: {
    canonical: '/news',
  },
};

type Props = {
  children: React.ReactNode;
};

export default async function RootLayout({ children }: Props) {
  const lang = resolveLang((await cookies()).get(LANG_COOKIE)?.value);
  return (
    <>
      <Hero title="News" sub={ui('newsPageHeading', lang)} />
      <Sheet>{children}</Sheet>
    </>
  );
}
