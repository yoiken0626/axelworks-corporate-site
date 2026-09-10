import Link from 'next/link';
import { ui } from '@/app/_libs/ui-strings';
import { type Lang } from '@/app/_libs/lang';
import styles from './index.module.css';

type Props = {
  lang: Lang;
};

const SOCIAL_LINKS = [
  {
    brand: 'facebook',
    label: 'Facebook',
    href: 'https://www.facebook.com/yoiken0626?locale=ja_JP',
    icon: (
      <path d="M13.397 20.997v-8.196h2.765l.411-3.209h-3.176V7.548c0-.926.258-1.56 1.587-1.56h1.684V3.127A22.336 22.336 0 0 0 14.201 3c-2.444 0-4.122 1.492-4.122 4.231v2.355H7.332v3.209h2.753v8.202h3.312z" />
    ),
  },
  {
    brand: 'x',
    label: 'X',
    href: 'https://x.com/KENICHIYOS52022',
    icon: (
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    ),
  },
  {
    brand: 'youtube',
    label: 'YouTube',
    href: 'https://www.youtube.com/@EricaEnglishImmersion',
    icon: <path d="M9 6.8 17.4 12 9 17.2z" />,
  },
] as const;

export default function Footer({ lang }: Props) {
  const newTab = ui('opensInNewTab', lang);
  // Footer は Server Component（'use client' なし）で、ルートレイアウトが cookies() を
  // 読むためページは常に動的レンダリングされる。年はサーバーで一度だけ評価され
  // クライアントで再実行されないため、ハイドレーション不整合は起きない。
  const year = new Date().getFullYear();
  return (
    <footer className={styles.footer}>
      <p className={styles.copyright}>
        {ui('footerCopyright', lang).replace('{year}', String(year))}
      </p>

      <div className={styles.right}>
        <ul className={styles.social}>
          {SOCIAL_LINKS.map((s) => (
            <li key={s.brand}>
              <a
                className={styles.socialIcon}
                data-brand={s.brand}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${s.label}${newTab}`}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  {s.icon}
                </svg>
              </a>
            </li>
          ))}
        </ul>

        <nav className={styles.links} aria-label={ui('navFooter', lang)}>
          <Link href="/terms">{ui('navTerms', lang)}</Link>
          <Link href="/privacy">{ui('navPrivacy', lang)}</Link>
        </nav>
      </div>
    </footer>
  );
}
