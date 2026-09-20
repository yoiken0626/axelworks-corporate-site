import fs from 'node:fs';
import path from 'node:path';
import Image from 'next/image';
import { cookies } from 'next/headers';
import { LANG_COOKIE, resolveLang } from '@/app/_libs/lang';
import { ui } from '@/app/_libs/ui-strings';
import { SAAS_DEMO } from '@/app/_constants';
import { SCROLL_DOCK_SENTINEL_ID } from '@/app/_libs/scroll-dock';
import PageReadAloud from '@/app/_components/PageReadAloud';
import ButtonLink from '@/app/_components/ButtonLink';
import styles from './page.module.css';

// スクリーンショットは、あとで public/saas/ に配置される想定。
// ファイルがまだ無い間は、その画像の枠ごと表示しない（ページを崩さない）。
const SCREENSHOTS = {
  yojitsu: 'saas-yojitsu.png',
  follower: 'saas-follower.png',
  notification: 'saas-notification.png',
} as const;

const SCREENSHOT_SIZES = '(max-width: 640px) calc(100vw - 64px), (max-width: 950px) calc((100vw - 192px) / 2), 340px';

function hasPublicImage(filename: string): boolean {
  try {
    return fs.existsSync(path.join(process.cwd(), 'public', 'saas', filename));
  } catch {
    return false;
  }
}

export default async function Page() {
  const lang = resolveLang((await cookies()).get(LANG_COOKIE)?.value);

  const hasYojitsuImage = hasPublicImage(SCREENSHOTS.yojitsu);
  const hasFollowerImage = hasPublicImage(SCREENSHOTS.follower);
  const hasNotificationImage = hasPublicImage(SCREENSHOTS.notification);

  // 読み上げ対象：見出しと本文（表示言語に合わせる）。ログインID・パスワードは含めない。
  const segments = [
    ui('saasHeading', lang),
    ui('saasLead', lang),
    ui('saasBuildingHeading', lang),
    ui('saasBuildingBody', lang),
    ui('saasScreensHeading', lang),
    ui('saasScreenYojitsuTitle', lang),
    ui('saasScreenYojitsuDesc', lang),
    ui('saasScreenFollowerTitle', lang),
    ui('saasScreenFollowerDesc', lang),
    ui('saasScreenNotificationTitle', lang),
    ui('saasScreenNotificationDesc', lang),
    ui('saasScreenAccessTitle', lang),
    ui('saasScreenAccessDesc', lang),
    ui('saasScreensNote', lang),
    ui('saasApproachHeading', lang),
    ui('saasApproachSelfTitle', lang),
    ui('saasApproachSelfDesc', lang),
    ui('saasApproachMultiTenantTitle', lang),
    ui('saasApproachMultiTenantDesc', lang),
    ui('saasApproachAssetsTitle', lang),
    ui('saasApproachAssetsDesc', lang),
    ui('saasApproachMigrationTitle', lang),
    ui('saasApproachMigrationDesc', lang),
    ui('saasApproachAiTitle', lang),
    ui('saasApproachAiDesc', lang),
    ui('saasDemoHeading', lang),
    ui('saasDemoBody', lang),
    ui('saasArticleHeading', lang),
    ui('saasArticleBody', lang),
    ui('saasArticleLinkLabel', lang),
    ui('saasArticleLangNote', lang),
  ];

  return (
    <>
      <PageReadAloud lang={lang} segments={segments} />

      <h1 className={styles.title} data-read-aloud-title>
        {ui('saasHeading', lang)}
      </h1>
      <p className={styles.lead}>{ui('saasLead', lang)}</p>

      {/* リード直後。ここが画面上端より上へ出たら地球儀・読み上げUIを画面最上部へせり上げる */}
      <div id={SCROLL_DOCK_SENTINEL_ID} aria-hidden="true" />

      <div className={styles.body} data-read-aloud-body>
        <h2>{ui('saasBuildingHeading', lang)}</h2>
        <p>{ui('saasBuildingBody', lang)}</p>

        <h2>{ui('saasScreensHeading', lang)}</h2>
        <div className={styles.screens}>
          <div className={styles.screenItem}>
            <h3>{ui('saasScreenYojitsuTitle', lang)}</h3>
            <p>{ui('saasScreenYojitsuDesc', lang)}</p>
            {hasYojitsuImage && (
              <div className={styles.screenMedia}>
                <Image
                  src={`/saas/${SCREENSHOTS.yojitsu}`}
                  alt={ui('saasScreenshotYojitsuAlt', lang)}
                  fill
                  sizes={SCREENSHOT_SIZES}
                  loading="lazy"
                  className={styles.screenImage}
                />
              </div>
            )}
          </div>
          <div className={styles.screenItem}>
            <h3>{ui('saasScreenFollowerTitle', lang)}</h3>
            <p>{ui('saasScreenFollowerDesc', lang)}</p>
            {hasFollowerImage && (
              <div className={styles.screenMedia}>
                <Image
                  src={`/saas/${SCREENSHOTS.follower}`}
                  alt={ui('saasScreenshotFollowerAlt', lang)}
                  fill
                  sizes={SCREENSHOT_SIZES}
                  loading="lazy"
                  className={styles.screenImage}
                />
              </div>
            )}
          </div>
          <div className={styles.screenItem}>
            <h3>{ui('saasScreenNotificationTitle', lang)}</h3>
            <p>{ui('saasScreenNotificationDesc', lang)}</p>
            {hasNotificationImage && (
              <div className={styles.screenMedia}>
                <Image
                  src={`/saas/${SCREENSHOTS.notification}`}
                  alt={ui('saasScreenshotNotificationAlt', lang)}
                  fill
                  sizes={SCREENSHOT_SIZES}
                  loading="lazy"
                  className={styles.screenImage}
                />
              </div>
            )}
          </div>
          <div className={styles.screenItem}>
            <h3>{ui('saasScreenAccessTitle', lang)}</h3>
            <p>{ui('saasScreenAccessDesc', lang)}</p>
          </div>
        </div>
        <p className={styles.screensNote}>{ui('saasScreensNote', lang)}</p>

        <h2>{ui('saasApproachHeading', lang)}</h2>
        <h3>{ui('saasApproachSelfTitle', lang)}</h3>
        <p>{ui('saasApproachSelfDesc', lang)}</p>
        <h3>{ui('saasApproachMultiTenantTitle', lang)}</h3>
        <p>{ui('saasApproachMultiTenantDesc', lang)}</p>
        <h3>{ui('saasApproachAssetsTitle', lang)}</h3>
        <p>{ui('saasApproachAssetsDesc', lang)}</p>
        <h3>{ui('saasApproachMigrationTitle', lang)}</h3>
        <p>{ui('saasApproachMigrationDesc', lang)}</p>
        <h3>{ui('saasApproachAiTitle', lang)}</h3>
        <p>{ui('saasApproachAiDesc', lang)}</p>

        <h2>{ui('saasDemoHeading', lang)}</h2>
        <p>{ui('saasDemoBody', lang)}</p>
        <div className={styles.demoActions}>
          <div className={styles.demoButton}>
            <ButtonLink href={SAAS_DEMO.url} isExternal lang={lang}>
              {ui('saasDemoButton', lang)}
            </ButtonLink>
          </div>
          {/* ログインID・パスワードは読み上げ対象から外す（既存の data-read-aloud-skip の仕組み） */}
          <div className={styles.credentials} data-read-aloud-skip>
            <div className={styles.credentialRow}>
              <span className={styles.credentialLabel}>{ui('saasDemoIdLabel', lang)}</span>
              <span className={styles.credentialValue}>{SAAS_DEMO.loginId}</span>
            </div>
            <div className={styles.credentialRow}>
              <span className={styles.credentialLabel}>{ui('saasDemoPasswordLabel', lang)}</span>
              <span className={styles.credentialValue}>{SAAS_DEMO.password}</span>
            </div>
          </div>
        </div>

        <h2>{ui('saasArticleHeading', lang)}</h2>
        <p>{ui('saasArticleBody', lang)}</p>
        <p>
          <a href="https://note.com/gentle_hawk873/n/nef80514fd7b0" target="_blank" rel="noopener noreferrer">
            {ui('saasArticleLinkLabel', lang)}
          </a>
          <span className="srOnly"> {ui('opensInNewTab', lang)}</span>{' '}
          <span className={styles.articleLangNote}>{ui('saasArticleLangNote', lang)}</span>
        </p>
      </div>

      <div className={styles.footer}>
        <h2 className={styles.message}>{ui('saasContactHeading', lang)}</h2>
        <p>{ui('saasContactBody', lang)}</p>
        <ButtonLink href="/contact">{ui('navContact', lang)}</ButtonLink>
      </div>
    </>
  );
}
