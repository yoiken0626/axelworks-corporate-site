import { cookies } from 'next/headers';
import { LANG_COOKIE, resolveLang } from '@/app/_libs/lang';
import { ui } from '@/app/_libs/ui-strings';
import styles from './page.module.css';

export default async function Page() {
  const lang = resolveLang((await cookies()).get(LANG_COOKIE)?.value);

  return (
    <>
      <h1 className={styles.lead}>
        {ui('companyLeadLine1', lang)}
        <br />
        {ui('companyLeadLine2', lang)}
      </h1>

      <section className={styles.block}>
        <h2 className={styles.heading}>{ui('companyHeading', lang)}</h2>
        <p className={styles.body}>{ui('companyBody', lang)}</p>
      </section>

      <section className={styles.block}>
        <h2 className={styles.subheading}>{ui('companyRepHeading', lang)}</h2>
        <p className={styles.body}>{ui('companyRepBody', lang)}</p>
        <p className={styles.repName}>{ui('companyRepName', lang)}</p>
        <p className={styles.repOrg}>AXelWorks</p>
        <p className={styles.repNote}>{ui('companyRepNote', lang)}</p>
      </section>
    </>
  );
}
