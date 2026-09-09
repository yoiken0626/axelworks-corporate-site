import { cookies } from 'next/headers';
import { LANG_COOKIE, resolveLang } from '@/app/_libs/lang';
import { ui } from '@/app/_libs/ui-strings';
import styles from './layout.module.css';

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
    <div className={styles.container}>
      {/* ヒーローバナーは廃止。ページ見出しは視覚的に非表示だが文書構造・SEO 用に残す */}
      <h1 className="srOnly">{ui('businessPageHeading', lang)}</h1>
      {children}
    </div>
  );
}
