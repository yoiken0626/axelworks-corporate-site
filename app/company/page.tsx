import styles from './page.module.css';

export default function Page() {
  return (
    <>
      <h1 className={styles.lead}>
        社員は一人。
        <br />
        でも、仕事は一人でやらない。
      </h1>

      <section className={styles.block}>
        <h2 className={styles.heading}>AIと人が、お互いの得意で働く会社。</h2>
        <p className={styles.body}>
          AIと長年のIT経験を組み合わせ、企業の「面倒」を減らすアプリと、人の「学びたい」を後押しするアプリをつくります。開発の過程もすべて公開しながら、AIと一緒に会社を育てていきます。
        </p>
      </section>

      <section className={styles.block}>
        <h2 className={styles.subheading}>代表について</h2>
        <p className={styles.body}>
          約39年、IT業界でエンジニアとして生きてきました。今はAIエージェント達と共に、一人企業に挑戦中です。
        </p>
        <p className={styles.repName}>吉田 健一</p>
        <p className={styles.repOrg}>AXelWorks</p>
        <p className={styles.repNote}>法人設立準備中｜所在地・登記情報は設立後に掲載予定</p>
      </section>
    </>
  );
}
