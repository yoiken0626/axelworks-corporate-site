import { cookies } from 'next/headers';
import { LANG_COOKIE, resolveLang } from '@/app/_libs/lang';
import { ui } from '@/app/_libs/ui-strings';
import { SCROLL_DOCK_SENTINEL_ID } from '@/app/_libs/scroll-dock';
import ButtonLink from '@/app/_components/ButtonLink';
import Image100Interactive from './Image100Interactive';
import styles from './page.module.css';

// 0〜9の10個の数字を、1回ずつだけ使う（重複なし）。横・縦は、それぞれ独立に
// シャッフルする（Fisher-Yates）。Server Component のレンダー時にだけ実行される。
// 言語切り替え（router.refresh）のたびにも再実行され新しい並びになるが、実際に
// 表示・読み上げに使う値は Image100Interactive 側で初回マウント時の値に固定する
// ため、画面上の数字とその並びは言語切り替えで変わらない（詳細はそちらのコメントを参照）。
const shuffledDigits = (): number[] => {
  const digits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  for (let i = digits.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [digits[i], digits[j]] = [digits[j], digits[i]];
  }
  return digits;
};

export default async function Page() {
  const lang = resolveLang((await cookies()).get(LANG_COOKIE)?.value);

  const horizontalDigits = shuffledDigits();
  const verticalDigits = shuffledDigits();

  return (
    <>
      <h1 className={styles.title} data-read-aloud-title>
        {ui('image100Heading', lang)}
      </h1>
      <p className={styles.lead}>{ui('image100Lead', lang)}</p>

      {/* リード直後。ここが画面上端より上へ出たら地球儀・読み上げUIを画面最上部へせり上げる */}
      <div id={SCROLL_DOCK_SENTINEL_ID} aria-hidden="true" />

      <div className={styles.howTo}>
        <p>{ui('image100HowToIntro', lang)}</p>
        <p className={styles.howToExample}>{ui('image100HowToExampleAnswerOnly', lang)}</p>
        <p className={styles.howToExample}>{ui('image100HowToExampleFullSentence', lang)}</p>
      </div>

      <Image100Interactive
        lang={lang}
        initialHorizontalDigits={horizontalDigits}
        initialVerticalDigits={verticalDigits}
      />

      <div className={styles.footer}>
        <h2 className={styles.message}>{ui('image100ContactHeading', lang)}</h2>
        <p>{ui('image100ContactBody', lang)}</p>
        <ButtonLink href="/contact">{ui('navContact', lang)}</ButtonLink>
      </div>
    </>
  );
}
