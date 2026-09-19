import { cookies } from 'next/headers';
import { LANG_COOKIE, resolveLang } from '@/app/_libs/lang';
import { ui } from '@/app/_libs/ui-strings';

export const metadata = {
  title: 'お問い合わせ｜AXelWorks',
  openGraph: {
    title: 'お問い合わせ｜AXelWorks',
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
      {/* ContactSection 自体は見出しが h2 なので、ページの h1 はここで視覚的には隠して用意する
          （business/layout.tsx と同じパターン）。 */}
      <h1 className="srOnly">{ui('navContact', lang)}</h1>
      {children}
    </>
  );
}
