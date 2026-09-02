import { cookies } from 'next/headers';
import Hero from '@/app/_components/Hero';
import Sheet from '@/app/_components/Sheet';
import { LANG_COOKIE, resolveLang } from '@/app/_libs/lang';
import { ui } from '@/app/_libs/ui-strings';

// ヘッダー/フッターが lang Cookie で切り替わるため、CDN キャッシュを無効化する。
// これが無いと Vercel が Cookie を無視して s-maxage=60 でキャッシュし、英語表示にならない。
export const dynamic = 'force-dynamic';

export const metadata = {
  title: '事業内容｜シンプルなコーポレートサイト',
  openGraph: {
    title: '事業内容｜シンプルなコーポレートサイト',
  },
  alternates: {
    canonical: '/business',
  },
};

type Props = {
  children: React.ReactNode;
};

export default async function RootLayout({ children }: Props) {
  const lang = resolveLang((await cookies()).get(LANG_COOKIE)?.value);
  return (
    <>
      <Hero title="Business" sub={ui('businessPageHeading', lang)} />
      <Sheet>{children}</Sheet>
    </>
  );
}
