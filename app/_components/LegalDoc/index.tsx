import styles from './index.module.css';

type Props = {
  title: string;
  /** 法人設立準備中の仮内容である旨の注記 */
  notice: string;
  children: React.ReactNode;
};

export default function LegalDoc({ title, notice, children }: Props) {
  return (
    <div className={styles.container}>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.notice}>{notice}</p>
      <div className={styles.doc}>{children}</div>
    </div>
  );
}
