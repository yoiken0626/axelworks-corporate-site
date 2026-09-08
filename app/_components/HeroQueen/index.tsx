import Image from 'next/image';
import Link from 'next/link';
import GlobeLanguageSwitcher from '@/app/_components/GlobeLanguageSwitcher';
import { type Lang } from '@/app/_libs/lang';
import styles from './index.module.css';

// 地球儀(＋国旗リング)を新イラストの紫の球体に重ねる位置。イラスト container に対する%
const GLOBE_POSITION = { left: 47, top: 66 };

// タイトルは全文表示が基本。表示上は CSS 側で 6 行相当を超えた分を隠す
// （省略記号なし）。この上限は CMS に異常に長い文字列が入ったときに
// 隠しテキストで DOM を膨らませないための保険で、表示可能な 6 行より十分大きい。
const BUBBLE_TITLE_FAILSAFE = 300;

const clampTitle = (title: string): string => {
  const t = title.trim();
  const chars = Array.from(t);
  return chars.length > BUBBLE_TITLE_FAILSAFE ? chars.slice(0, BUBBLE_TITLE_FAILSAFE).join('') : t;
};

type Props = {
  lang: Lang;
  /** 読み上げの発話タイミングに同期した口の開閉。true で口開き画像を表示 */
  mouthOpen?: boolean;
  /** 吹き出しに出す最新記事（無ければ null） */
  latestNews: { slug: string; title: string } | null;
};

export default function HeroQueen({ lang, mouthOpen = false, latestNews }: Props) {
  return (
    <div className={styles.wrapper}>
      {/* ベース（口閉じ）。常時表示・切り替えなし。比率は .wrapper の aspect-ratio で確定 */}
      <Image
        src="/hero-queen-erica-2.png"
        alt="王冠をつけた女性が紫の球体を両手で持っているイラスト"
        fill
        priority
        sizes="(max-width: 900px) 100vw, 900px"
        className={styles.image}
      />
      {/* 口開き画像を「口元だけ」楕円マスクで切り抜いて重ね、data-open で表示を切り替える */}
      <Image
        src="/hero-queen-erica-3.png"
        alt=""
        fill
        aria-hidden="true"
        sizes="(max-width: 900px) 100vw, 900px"
        className={styles.mouthOverlay}
        data-open={mouthOpen ? 'true' : 'false'}
      />

      <div
        className={styles.globeSlot}
        style={{ left: `${GLOBE_POSITION.left}%`, top: `${GLOBE_POSITION.top}%` }}
      >
        <GlobeLanguageSwitcher className={styles.globe} />
      </div>

      {/* 思考の泡（thought bubble）：モコモコした雲だけで表現。
         口元（右下）側に小さなコブを2つ添えて「心の声」感を出す。
         独立した丸の“しっぽ”は置かない（スマホで地球儀等と重なるため廃止）。 */}
      <div className={styles.thought}>
        <svg
          className={styles.cloud}
          viewBox="0 0 240 170"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <g fill="#fff">
            <ellipse cx="117" cy="88" rx="99" ry="52" />
            <circle cx="49" cy="62" r="34" />
            <circle cx="95" cy="39" r="42" />
            <circle cx="145" cy="43" r="37" />
            <circle cx="185" cy="60" r="34" />
            <circle cx="203" cy="90" r="23" />
            <circle cx="50" cy="114" r="34" />
            <circle cx="103" cy="132" r="38" />
            <circle cx="155" cy="125" r="33" />
            <circle cx="191" cy="115" r="25" />
            {/* 口元（下・やや右）へ向かう控えめなコブを2つ */}
            <circle cx="188" cy="140" r="14" />
            <circle cx="201" cy="153" r="7.5" />
          </g>
        </svg>
        <p className={styles.bubbleText}>
          {latestNews && (
            <Link
              href={`/news/${latestNews.slug}?lang=${lang}`}
              className={styles.bubbleLink}
              title={latestNews.title}
            >
              {clampTitle(latestNews.title)}
            </Link>
          )}
        </p>
      </div>
    </div>
  );
}
