import Image from 'next/image';
import GlobeLanguageSwitcher from '@/app/_components/GlobeLanguageSwitcher';
import { ui } from '@/app/_libs/ui-strings';
import { type Lang } from '@/app/_libs/lang';
import styles from './index.module.css';

// 地球儀(＋国旗リング)をイラストのどの位置に重ねるか。イラスト container に対する%
const GLOBE_POSITION = { left: 42, top: 70 };

type Props = {
  lang: Lang;
};

export default function HeroQueen({ lang }: Props) {
  return (
    <div className={styles.wrapper}>
      <div className={styles.bubble}>{ui('heroSpeech', lang)}</div>

      <Image
        src="/hero-queen-erica.png"
        alt="王冠をつけたキャラクターが地球儀を両手で持っているイラスト"
        width={1246}
        height={1263}
        priority
        className={styles.image}
      />

      <div
        className={styles.globeSlot}
        style={{ left: `${GLOBE_POSITION.left}%`, top: `${GLOBE_POSITION.top}%` }}
      >
        <GlobeLanguageSwitcher className={styles.globe} />
      </div>
    </div>
  );
}
