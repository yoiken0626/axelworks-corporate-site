import { ui } from '@/app/_libs/ui-strings';
import { type Lang } from '@/app/_libs/lang';
import styles from './index.module.css';

type Props = {
  lang: Lang;
};

/** ニュース一覧ページ（/news, /news/p/N）の h1。 */
export default function NewsListHeading({ lang }: Props) {
  return <h1 className={styles.heading}>{ui('newsListHeading', lang)}</h1>;
}
