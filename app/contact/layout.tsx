import { cookies } from 'next/headers';
import Hero from '@/app/_components/Hero';
import Sheet from '@/app/_components/Sheet';
import { LANG_COOKIE, resolveLang } from '@/app/_libs/lang';
import { ui } from '@/app/_libs/ui-strings';

export const metadata = {
  title: 'コンタクト｜シンプルなコーポレートサイト',
  openGraph: {
    title: 'コンタクト｜シンプルなコーポレートサイト',
  },
  alternates: {
    canonical: '/contact',
  },
};

type Props = {
  children: React.ReactNode;
};

export default async function RootLayout({ children }: Props) {
  const lang = resolveLang((await cookies()).get(LANG_COOKIE)?.value);
  return (
    <>
      <Hero title="Contact" sub={ui('navContact', lang)} />
      <Sheet>{children}</Sheet>
    </>
  );
}
