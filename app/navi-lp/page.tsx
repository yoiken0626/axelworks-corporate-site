import Image from 'next/image';
import { cookies } from 'next/headers';
import { LANG_COOKIE, resolveLang } from '@/app/_libs/lang';
import { ui } from '@/app/_libs/ui-strings';
import { NAVI_LP_LINKS } from '@/app/_constants';
import { SCROLL_DOCK_SENTINEL_ID } from '@/app/_libs/scroll-dock';
import { resolvePublicImage } from '@/app/_libs/public-image';
import PageReadAloud from '@/app/_components/PageReadAloud';
import ButtonLink from '@/app/_components/ButtonLink';
import styles from './page.module.css';

// スクリーンショットは public/navi-lp/ に配置される（.webp を優先、.png にもフォールバック）。
// ファイルがまだ無い間は、その画像の枠ごと表示しない（ページを崩さない）。
const SCREENSHOTS = {
  guided: 'navi-lp-guided',
  lpNotes: 'navi-lp-lpnotes',
} as const;

// カードにpadding(24px×2)があるぶん、/saas の主な画面より少し狭い実効幅になる。
// 950px以下は1カラム（コンテナ幅 100vw-64px からカードpaddingを引いた分）、
// 950px超は2カラム固定（コンテナが840pxで頭打ちになるため、カード内側の実効幅もほぼ一定）。
const SCREENSHOT_SIZES = '(max-width: 950px) calc(100vw - 112px), 360px';

export default async function Page() {
  const lang = resolveLang((await cookies()).get(LANG_COOKIE)?.value);

  const guidedImageSrc = resolvePublicImage('navi-lp', SCREENSHOTS.guided);
  const lpNotesImageSrc = resolvePublicImage('navi-lp', SCREENSHOTS.lpNotes);

  // 読み上げ対象：見出しと本文（表示言語に合わせる）
  const segments = [
    ui('naviLpHeading', lang),
    ui('naviLpLead', lang),
    ui('naviLpAboutHeading', lang),
    ui('naviLpAboutBody', lang),
    ui('naviLpVariantsHeading', lang),
    ui('naviLpGuidedTitle', lang),
    ui('naviLpGuidedIntro', lang),
    ui('naviLpGuidedPoint1', lang),
    ui('naviLpGuidedPoint2', lang),
    ui('naviLpGuidedPoint3', lang),
    ui('naviLpGuidedPoint4', lang),
    ui('naviLpGuidedSuitable', lang),
    ui('naviLpGuidedArticleLinkLabel', lang),
    ui('saasArticleLangNote', lang),
    ui('naviLpLpNotesTitle', lang),
    ui('naviLpLpNotesTagline', lang),
    ui('naviLpLpNotesIntro', lang),
    ui('naviLpLpNotesPoint1', lang),
    ui('naviLpLpNotesPoint2', lang),
    ui('naviLpLpNotesPoint3', lang),
    ui('naviLpLpNotesPoint4', lang),
    ui('naviLpLpNotesSuitable', lang),
    ui('naviLpLpNotesArticleLinkLabel', lang),
    ui('saasArticleLangNote', lang),
    ui('naviLpChoiceHeading', lang),
    ui('naviLpChoiceLine1', lang),
    ui('naviLpChoiceLine2', lang),
    ui('naviLpContactHeading', lang),
    ui('naviLpContactBody', lang),
  ];

  return (
    <>
      <PageReadAloud lang={lang} segments={segments} />

      <h1 className={styles.title} data-read-aloud-title>
        {ui('naviLpHeading', lang)}
      </h1>
      <p className={styles.lead}>{ui('naviLpLead', lang)}</p>

      {/* リード直後。ここが画面上端より上へ出たら地球儀・読み上げUIを画面最上部へせり上げる */}
      <div id={SCROLL_DOCK_SENTINEL_ID} aria-hidden="true" />

      <div className={styles.body} data-read-aloud-body>
        <h2>{ui('naviLpAboutHeading', lang)}</h2>
        <p>{ui('naviLpAboutBody', lang)}</p>

        <h2>{ui('naviLpVariantsHeading', lang)}</h2>
        <div className={styles.variants}>
          {/* バリエーション1：音声ガイドLP */}
          <div className={styles.variantCard}>
            <h3 className={styles.variantTitle}>{ui('naviLpGuidedTitle', lang)}</h3>
            <p className={styles.variantIntro}>{ui('naviLpGuidedIntro', lang)}</p>
            {guidedImageSrc && (
              <div className={styles.variantMedia}>
                <Image
                  src={guidedImageSrc}
                  alt={ui('naviLpGuidedScreenshotAlt', lang)}
                  fill
                  sizes={SCREENSHOT_SIZES}
                  priority
                  className={styles.variantImage}
                />
              </div>
            )}
            <ul>
              <li>{ui('naviLpGuidedPoint1', lang)}</li>
              <li>{ui('naviLpGuidedPoint2', lang)}</li>
              <li>{ui('naviLpGuidedPoint3', lang)}</li>
              <li>{ui('naviLpGuidedPoint4', lang)}</li>
            </ul>
            <p className={styles.variantSuitable}>{ui('naviLpGuidedSuitable', lang)}</p>
            <div className={styles.variantActions}>
              <ButtonLink href={NAVI_LP_LINKS.guidedLpUrl} isExternal lang={lang}>
                {ui('naviLpGuidedButton', lang)}
              </ButtonLink>
            </div>
            <p className={styles.variantArticle}>
              <a href={NAVI_LP_LINKS.guidedLpArticleUrl} target="_blank" rel="noopener noreferrer">
                {ui('naviLpGuidedArticleLinkLabel', lang)}
              </a>
              <span className="srOnly"> {ui('opensInNewTab', lang)}</span>{' '}
              <span className={styles.articleLangNote}>{ui('saasArticleLangNote', lang)}</span>
            </p>
          </div>

          {/* バリエーション2：LPNotes（本体へのリンクは置かない。note記事のみ） */}
          <div className={styles.variantCard}>
            <h3 className={styles.variantTitle}>{ui('naviLpLpNotesTitle', lang)}</h3>
            <p className={styles.variantTagline}>{ui('naviLpLpNotesTagline', lang)}</p>
            <p className={styles.variantIntro}>{ui('naviLpLpNotesIntro', lang)}</p>
            {lpNotesImageSrc && (
              <div className={styles.variantMedia}>
                <Image
                  src={lpNotesImageSrc}
                  alt={ui('naviLpLpNotesScreenshotAlt', lang)}
                  fill
                  sizes={SCREENSHOT_SIZES}
                  loading="lazy"
                  className={styles.variantImage}
                />
              </div>
            )}
            <ul>
              <li>{ui('naviLpLpNotesPoint1', lang)}</li>
              <li>{ui('naviLpLpNotesPoint2', lang)}</li>
              <li>{ui('naviLpLpNotesPoint3', lang)}</li>
              <li>{ui('naviLpLpNotesPoint4', lang)}</li>
            </ul>
            <p className={styles.variantSuitable}>{ui('naviLpLpNotesSuitable', lang)}</p>
            <div className={styles.variantActions} aria-hidden="true" />
            <p className={styles.variantArticle}>
              <a href={NAVI_LP_LINKS.lpNotesArticleUrl} target="_blank" rel="noopener noreferrer">
                {ui('naviLpLpNotesArticleLinkLabel', lang)}
              </a>
              <span className="srOnly"> {ui('opensInNewTab', lang)}</span>{' '}
              <span className={styles.articleLangNote}>{ui('saasArticleLangNote', lang)}</span>
            </p>
          </div>
        </div>

        <h2>{ui('naviLpChoiceHeading', lang)}</h2>
        <ul className={styles.choiceList}>
          <li>{ui('naviLpChoiceLine1', lang)}</li>
          <li>{ui('naviLpChoiceLine2', lang)}</li>
        </ul>
      </div>

      <div className={styles.footer}>
        <h2 className={styles.message}>{ui('naviLpContactHeading', lang)}</h2>
        <p>{ui('naviLpContactBody', lang)}</p>
        <ButtonLink href="/contact">{ui('navContact', lang)}</ButtonLink>
      </div>
    </>
  );
}
