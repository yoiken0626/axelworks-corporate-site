import Image from 'next/image';
import GlobeLanguageSwitcher from '@/app/_components/GlobeLanguageSwitcher';
import { ui } from '@/app/_libs/ui-strings';
import { type Lang } from '@/app/_libs/lang';
import styles from './index.module.css';

// 地球儀(＋国旗リング)を新イラストの紫の球体に重ねる位置。イラスト container に対する%
const GLOBE_POSITION = { left: 47, top: 66 };

type Props = {
  lang: Lang;
  /** 読み上げの発話タイミングに同期した口の開閉。true で口開き画像を表示 */
  mouthOpen?: boolean;
};

export default function HeroQueen({ lang, mouthOpen = false }: Props) {
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
      {/* 口開き画像を「口元だけ」楕円マスクで切り抜いて重ね、opacity だけをトグルする */}
      <Image
        src="/hero-queen-erica-3.png"
        alt=""
        fill
        aria-hidden="true"
        sizes="(max-width: 900px) 100vw, 900px"
        className={styles.mouthOverlay}
        style={{ opacity: mouthOpen ? 1 : 0 }}
      />

      <div
        className={styles.globeSlot}
        style={{ left: `${GLOBE_POSITION.left}%`, top: `${GLOBE_POSITION.top}%` }}
      >
        <GlobeLanguageSwitcher className={styles.globe} />
      </div>

      {/* 思考の泡（thought bubble）：モコモコした雲＋口元へ連なる小さな丸のしっぽ */}
      <div className={styles.thought}>
        <svg
          className={styles.cloud}
          viewBox="0 0 240 170"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <g fill="#fff">
            <ellipse cx="120" cy="92" rx="100" ry="54" />
            <circle cx="54" cy="66" r="36" />
            <circle cx="104" cy="44" r="42" />
            <circle cx="156" cy="46" r="38" />
            <circle cx="196" cy="74" r="34" />
            <circle cx="58" cy="122" r="34" />
            <circle cx="118" cy="136" r="36" />
            <circle cx="180" cy="124" r="32" />
          </g>
        </svg>
        <p className={styles.bubbleText}>{ui('heroSpeech', lang)}</p>
      </div>

      <span className={styles.tailDot} data-dot="1" aria-hidden="true" />
      <span className={styles.tailDot} data-dot="2" aria-hidden="true" />
      <span className={styles.tailDot} data-dot="3" aria-hidden="true" />
    </div>
  );
}
