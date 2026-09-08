import Image from 'next/image';
import styles from './index.module.css';

type Props = {
  title: string;
  sub: string;
};

export default function Hero({ title, sub }: Props) {
  return (
    <section className={styles.container}>
      <div>
        {/* 装飾の英字ラベル。意味は下の h1（表示言語）が担うので支援技術からは隠す */}
        <p className={styles.title} aria-hidden="true">
          {title}
        </p>
        <h1 className={styles.sub}>{sub}</h1>
      </div>
      <Image
        className={styles.bgimg}
        src="/img-mv.jpg"
        alt=""
        width={4000}
        height={1200}
        priority
      />
    </section>
  );
}
