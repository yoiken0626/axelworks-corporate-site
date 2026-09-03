import styles from './layout.module.css';

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

export default function RootLayout({ children }: Props) {
  // note のように、ヒーローバナーを置かずヘッダー直下から本文を始める
  return <div className={styles.container}>{children}</div>;
}
