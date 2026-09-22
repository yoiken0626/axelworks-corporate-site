import { Metadata } from 'next';
import Script from 'next/script';
import { cookies } from 'next/headers';
import { getMeta } from '@/app/_libs/microcms';
import { LANG_COOKIE, resolveLang } from '@/app/_libs/lang';
import Footer from '@/app/_components/Footer';
import Header from '@/app/_components/Header';
import GoogleAnalytics from '@/app/_components/GoogleAnalytics';
import { ui } from '@/app/_libs/ui-strings';
import './globals.css';
import styles from './layout.module.css';

// GA4の測定ID。未設定（開発中など）なら下のタグ自体を埋め込まない（エラーにはしない）。
const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

export async function generateMetadata(): Promise<Metadata> {
  const data = await getMeta();
  if (!data) {
    return {};
  }

  return {
    metadataBase: new URL(process.env.BASE_URL || 'http://localhost:3000'),
    title: data.title,
    description: data.description,
    openGraph: {
      title: data.ogTitle,
      description: data.ogDescription,
      images: [data.ogImage?.url || ''],
    },
    alternates: {
      canonical: data.canonical,
    },
  };
}

type Props = {
  children: React.ReactNode;
};

export default async function RootLayout({ children }: Props) {
  const cookieStore = await cookies();
  const lang = resolveLang(cookieStore.get(LANG_COOKIE)?.value);
  return (
    <html lang={lang}>
      <body className={styles.body}>
        {GA_ID && (
          <>
            <Script strategy="afterInteractive" src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} />
            <Script id="ga4-init" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${GA_ID}');
              `}
            </Script>
          </>
        )}
        <GoogleAnalytics />
        <a href="#main" className="skipLink">
          {ui('skipToContent', lang)}
        </a>
        <Header lang={lang} />
        <main id="main" tabIndex={-1}>
          {children}
        </main>
        <Footer lang={lang} />
      </body>
    </html>
  );
}
