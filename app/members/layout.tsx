import Hero from '@/app/_components/Hero';
import Sheet from '@/app/_components/Sheet';

// ヘッダー/フッターが lang Cookie で切り替わるため、CDN キャッシュを無効化する。
// これが無いと Vercel が Cookie を無視して s-maxage=60 でキャッシュし、英語表示にならない。
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'メンバー｜シンプルなコーポレートサイト',
  openGraph: {
    title: 'メンバー｜シンプルなコーポレートサイト',
  },
  alternates: {
    canonical: '/members',
  },
};

type Props = {
  children: React.ReactNode;
};

export default function RootLayout({ children }: Props) {
  return (
    <>
      <Hero title="Members" sub="メンバー" />
      <Sheet>{children}</Sheet>
    </>
  );
}
