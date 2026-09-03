import Image from 'next/image';
import { cookies } from 'next/headers';
import { getNewsList } from '@/app/_libs/microcms';
import { TOP_NEWS_LIMIT } from '@/app/_constants';
import { LANG_COOKIE, resolveLang } from '@/app/_libs/lang';
import { ui } from '@/app/_libs/ui-strings';
import NewsList from '@/app/_components/NewsList';
import styles from './page.module.css';
import ButtonLink from '@/app/_components/ButtonLink';
import HeroSection from '@/app/_components/HeroSection';
import ContactSection from '@/app/_components/ContactSection';

export default async function Page() {
  const cookieStore = await cookies();
  const lang = resolveLang(cookieStore.get(LANG_COOKIE)?.value);
  const data = await getNewsList({
    limit: TOP_NEWS_LIMIT,
  });

  // 読み上げ対象：トップページの主要テキスト（ui-strings の文言＋記事タイトル）を表示順に
  const newsTitles = data.contents.map((a) => (lang === 'en' && a.title_en) || a.title);
  const readSegments = [
    ui('heroSpeech', lang),
    ui('newsHeading', lang),
    ...newsTitles,
    ui('businessSubtitle', lang),
    ui('businessBody1', lang),
    ui('businessBody2', lang),
    ui('aboutSubtitle', lang),
    ui('aboutMission', lang),
    ui('aboutService1', lang),
    ui('aboutService2', lang),
    ui('aboutService3', lang),
    ui('hiringSubtitle', lang),
    ui('hiringBody1', lang),
    ui('hiringBody2', lang),
  ];

  return (
    <>
      <section className={styles.top}>
        <HeroSection lang={lang} segments={readSegments} />
      </section>
      <section className={styles.news}>
        <h2 className={styles.newsTitle}>{ui('newsHeading', lang)}</h2>
        <NewsList articles={data.contents} />
        <div className={styles.newsLink}>
          <ButtonLink href="/news">{ui('seeMore', lang)}</ButtonLink>
        </div>
      </section>
      <section className={styles.section}>
        <div className={styles.horizontal}>
          <div>
            <h2 className={styles.sectionTitleEn}>{ui('businessHeading', lang)}</h2>
            <p className={styles.sectionTitleJa}>{ui('businessSubtitle', lang)}</p>
            <p className={styles.sectionDescription}>
              {ui('businessBody1', lang)}
              <br />
              {ui('businessBody2', lang)}
            </p>
            <ButtonLink href="/business">{ui('seeMore', lang)}</ButtonLink>
          </div>
          <Image
            className={styles.businessImg}
            src="/img-business.png"
            alt=""
            width={1024}
            height={1024}
          />
        </div>
      </section>
      <div className={styles.aboutus}>
        <section className={styles.section}>
          <div className={styles.horizontal}>
            <Image
              className={styles.aboutusImg}
              src="/img-aboutus.jpg"
              alt=""
              width={6000}
              height={4000}
            />
            <div>
              <h2 className={styles.sectionTitleEn}>{ui('aboutHeading', lang)}</h2>
              <p className={styles.sectionTitleJa}>{ui('aboutSubtitle', lang)}</p>
              <p className={styles.sectionDescription}>{ui('aboutMission', lang)}</p>
              <ul className={styles.businessList}>
                <li>{ui('aboutService1', lang)}</li>
                <li>{ui('aboutService2', lang)}</li>
                <li>{ui('aboutService3', lang)}</li>
              </ul>
              <dl className={styles.info}>
                <dt className={styles.infoTitle}>{ui('aboutInfoCompany', lang)}</dt>
                <dd className={styles.infoDescription}>AXelWorks</dd>
              </dl>
              <dl className={styles.info}>
                <dt className={styles.infoTitle}>{ui('aboutInfoFounded', lang)}</dt>
                <dd className={styles.infoDescription}>{ui('aboutInfoTBD', lang)}</dd>
              </dl>
              <dl className={styles.info}>
                <dt className={styles.infoTitle}>{ui('aboutInfoLocation', lang)}</dt>
                <dd className={styles.infoDescription}>{ui('aboutInfoTBD', lang)}</dd>
              </dl>
              <dl className={styles.info}>
                <dt className={styles.infoTitle}>{ui('aboutInfoRepresentative', lang)}</dt>
                <dd className={styles.infoDescription}>{ui('aboutRepName', lang)}</dd>
              </dl>
              <dl className={styles.info}>
                <dt className={styles.infoTitle}>{ui('aboutInfoCapital', lang)}</dt>
                <dd className={styles.infoDescription}>{ui('aboutInfoTBD', lang)}</dd>
              </dl>
            </div>
          </div>
        </section>
      </div>
      <section className={styles.section}>
        <div className={styles.horizontal}>
          <div>
            <h2 className={styles.sectionTitleEn}>{ui('hiringHeading', lang)}</h2>
            <p className={styles.sectionTitleJa}>{ui('hiringSubtitle', lang)}</p>
            <p className={styles.sectionDescription}>
              {ui('hiringBody1', lang)}
              <br />
              {ui('hiringBody2', lang)}
            </p>
            <ButtonLink href="">{ui('hiringLink', lang)}</ButtonLink>
          </div>
          <Image
            className={styles.hiringImg}
            src="/img-hiring.jpg"
            alt=""
            width={960}
            height={960}
          />
        </div>
      </section>
      <ContactSection lang={lang} />
    </>
  );
}
