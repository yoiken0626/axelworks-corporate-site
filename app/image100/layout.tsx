import styles from './layout.module.css';

// ヘッダー/フッターが lang Cookie で切り替わるため、CDN キャッシュを無効化する。
// これが無いと Vercel が Cookie を無視して s-maxage=60 でキャッシュし、英語表示にならない。
// 横縦の見出しの数字も、リクエストごとにサーバー側で新しく生成するため、force-dynamic が必要。
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'イメージ100計算｜AXelWorks',
  description: '言語脳を刺激したら、計算脳も刺激して、頭の柔軟体操で、一息入れて、リラックスしましょう',
  openGraph: {
    title: 'イメージ100計算｜AXelWorks',
  },
  alternates: {
    canonical: '/image100',
  },
};

type Props = {
  children: React.ReactNode;
};

export default function RootLayout({ children }: Props) {
  return <div className={styles.container}>{children}</div>;
}
