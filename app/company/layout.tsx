import styles from './layout.module.css';

// ヘッダー/フッターが lang Cookie で切り替わるため、CDN キャッシュを無効化する。
// これが無いと Vercel が Cookie を無視して s-maxage=60 でキャッシュし、英語表示にならない。
export const dynamic = 'force-dynamic';

export const metadata = {
  title: '私たちについて｜シンプルなコーポレートサイト',
  openGraph: {
    title: '私たちについて｜シンプルなコーポレートサイト',
  },
  alternates: {
    canonical: '/company',
  },
};

type Props = {
  children: React.ReactNode;
};

export default function RootLayout({ children }: Props) {
  return <div className={styles.container}>{children}</div>;
}
