'use client';

import Link from 'next/link';
import classNames from 'classnames';
import { setLangCookie, type Lang } from '@/app/_libs/lang';
import styles from './index.module.css';

type Props = {
  slug: string;
  lang?: string;
  dk?: string;
};

export default function LanguageToggle({ slug, lang, dk }: Props) {
  const isEn = lang === 'en';

  // lang は常に明示的に付与する。こうすることで lang Cookie が en でも
  // 「日本語」リンクが確実に日本語表示になる(URL パラメータが Cookie より優先)。
  const buildHref = (targetLang: Lang) => {
    const params = new URLSearchParams();
    params.set('lang', targetLang);
    if (dk) {
      params.set('dk', dk);
    }
    return `/news/${slug}?${params.toString()}`;
  };

  return (
    <div className={styles.toggle}>
      <Link
        href={buildHref('ja')}
        className={classNames(styles.item, { [styles.active]: !isEn })}
        onClick={() => setLangCookie('ja')}
      >
        日本語
      </Link>
      <Link
        href={buildHref('en')}
        className={classNames(styles.item, { [styles.active]: isEn })}
        onClick={() => setLangCookie('en')}
      >
        English
      </Link>
    </div>
  );
}
