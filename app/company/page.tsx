import { cookies } from 'next/headers';
import { LANG_COOKIE, resolveLang } from '@/app/_libs/lang';
import { ui } from '@/app/_libs/ui-strings';
import { SCROLL_DOCK_SENTINEL_ID } from '@/app/_libs/scroll-dock';
import PageReadAloud from '@/app/_components/PageReadAloud';
import styles from './page.module.css';

export default async function Page() {
  const lang = resolveLang((await cookies()).get(LANG_COOKIE)?.value);

  // 読み上げ対象：見出し（リード2行）・本文・代表についての見出しと本文・代表者名・
  // 組織名・注記まで、ページ全体のテキスト。リードの2行は同じ <h1>（読み上げの
  // タイトル扱い）の中に収まっているため、1つの segment にまとめて渡す
  // （タイトルはハイライト側でも常に1つの塊として扱われるため、これで一致する）。
  const segments = [
    `${ui('companyLeadLine1', lang)} ${ui('companyLeadLine2', lang)}`,
    ui('companyHeading', lang),
    ui('companyBody', lang),
    ui('companyRepHeading', lang),
    ui('companyRepBody', lang),
    ui('companyRepName', lang),
    'AXelWorks',
    ui('companyRepNote', lang),
  ];

  return (
    <>
      <PageReadAloud lang={lang} segments={segments} />

      <h1 className={styles.lead} data-read-aloud-title>
        {ui('companyLeadLine1', lang)}
        <br />
        {ui('companyLeadLine2', lang)}
      </h1>

      {/* リード直後。ここが画面上端より上へ出たら地球儀・読み上げUIを画面最上部へせり上げる */}
      <div id={SCROLL_DOCK_SENTINEL_ID} aria-hidden="true" />

      <section className={styles.block} data-read-aloud-body>
        <h2 className={styles.heading}>{ui('companyHeading', lang)}</h2>
        <p className={styles.body}>{ui('companyBody', lang)}</p>
      </section>

      <section className={styles.block} data-read-aloud-body>
        <h2 className={styles.subheading}>{ui('companyRepHeading', lang)}</h2>
        <p className={styles.body}>{ui('companyRepBody', lang)}</p>
        <p className={styles.repName}>{ui('companyRepName', lang)}</p>
        <p className={styles.repOrg}>AXelWorks</p>
        <p className={styles.repNote}>{ui('companyRepNote', lang)}</p>
      </section>
    </>
  );
}
