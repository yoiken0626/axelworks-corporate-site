import Link from 'next/link';
import classNames from 'classnames';
import styles from './index.module.css';

type Props = {
  slug: string;
  lang?: string;
  dk?: string;
};

export default function LanguageToggle({ slug, lang, dk }: Props) {
  const isEn = lang === 'en';

  const buildHref = (targetLang?: 'en') => {
    const params = new URLSearchParams();
    if (targetLang) {
      params.set('lang', targetLang);
    }
    if (dk) {
      params.set('dk', dk);
    }
    const query = params.toString();
    return `/news/${slug}${query ? `?${query}` : ''}`;
  };

  return (
    <div className={styles.toggle}>
      <Link href={buildHref()} className={classNames(styles.item, { [styles.active]: !isEn })}>
        日本語
      </Link>
      <Link href={buildHref('en')} className={classNames(styles.item, { [styles.active]: isEn })}>
        English
      </Link>
    </div>
  );
}
