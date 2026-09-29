'use client';

import { useCallback, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import classNames from 'classnames';
import { ui } from '@/app/_libs/ui-strings';
import { setLangCookie, type Lang } from '@/app/_libs/lang';
import { LANGUAGES } from '@/app/_libs/lang-registry';
import styles from './index.module.css';

// three.js は重いので遅延ロード。地球儀はハイドレーション後にクライアントで描画する。
const Earth3D = dynamic(() => import('./Earth3D'), { ssr: false });

type Flag = {
  code: string;
  // public/flags/<icon>.svg（circle-flags 由来の円形SVG。ISO 3166-1 alpha-2）
  icon: string;
  label: string;
  lang: Lang;
};

// 全対応言語（レジストリの並び順＝地球儀の国旗リングの並び順）
const FLAGS: Flag[] = LANGUAGES.map((l) => ({
  code: l.code,
  icon: l.flagIcon,
  label: l.label,
  lang: l.code,
}));

// 国旗リングは地球儀(ルート要素)の中心を基準に等角で円状に配置する。
// 中心からの距離は呼び出し側が指定する CSS 変数 --gls-ring-radius（px）。
const RING_START_ANGLE = -90; // 真上から時計回り
const SECTOR_DEGREES = 360 / FLAGS.length;

const getFlagOffset = (index: number) => {
  const angle = ((RING_START_ANGLE + SECTOR_DEGREES * index) * Math.PI) / 180;
  return { cos: Math.cos(angle).toFixed(4), sin: Math.sin(angle).toFixed(4) };
};

type Props = {
  className?: string;
  /** 現在の表示言語。切り替え済みかどうかの判定・aria-label に使う */
  lang: Lang;
};

export default function GlobeLanguageSwitcher({ className, lang }: Props) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);

  // リング上の「見た目のハイライト」状態。実際に表示中の言語（lang）とは独立させ、
  // 初期状態（ページ表示直後・地球儀クリック後）は必ず全国旗が通常表示になる
  // （＝現在の言語をリング上で常時強調表示し続ける仕組みではない）。
  const [highlightedLang, setHighlightedLang] = useState<Lang | null>(null);

  const selectLang = useCallback(
    (nextLang: Lang) => {
      setHighlightedLang(nextLang);
      if (nextLang === lang) return;
      // 閉じる操作の無い常時表示リングになったため、フォーカス移動は行わない
      // （選択後もその国旗のボタンにフォーカスが残る＝Tabキーでの続けての操作がしやすい）。
      setLangCookie(nextLang);
      router.refresh();
    },
    [lang, router],
  );

  const resetHighlight = useCallback(() => {
    setHighlightedLang(null);
  }, []);

  // 国旗の輪の領域（.hitLayer）内のポインター操作を、地球儀中心からの角度で
  // 12個の国旗（各30度の扇形）に振り分ける。国旗どうしの重なり順（z-index）に
  // 関係なく、常にすべての国旗を同じ広さで押せるようにするための実装。
  // 地球儀の外周より内側（円の中）をクリックした場合は地球儀のクリックとして扱う。
  const handleRingClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    const root = rootRef.current;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = event.clientX - centerX;
    const dy = event.clientY - centerY;
    const distance = Math.hypot(dx, dy);
    const earthRadius = rect.width / 2;

    if (distance <= earthRadius) {
      resetHighlight();
      return;
    }

    const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
    const normalized = (angleDeg + 360) % 360;
    const startNormalized = (RING_START_ANGLE + 360) % 360;
    const offset = (normalized - startNormalized + 360) % 360;
    const index = Math.round(offset / SECTOR_DEGREES) % FLAGS.length;
    selectLang(FLAGS[index].lang);
  };

  const currentFlag = FLAGS.find((f) => f.lang === lang) ?? FLAGS[0];
  const switcherLabel = ui('globeLanguageSwitcherLabel', lang).replace('{lang}', currentFlag.label);

  return (
    <div ref={rootRef} className={classNames(styles.root, className)}>
      <button type="button" className={styles.globeButton} onClick={resetHighlight} aria-label={switcherLabel}>
        <Earth3D className={styles.earthGlobe} />
      </button>

      <ul className={styles.flagList} aria-label={ui('globeLanguageMenuHeading', lang)}>
        {FLAGS.map((flag, index) => {
          const { cos, sin } = getFlagOffset(index);
          const state =
            highlightedLang == null ? 'normal' : highlightedLang === flag.lang ? 'active' : 'dimmed';
          return (
            <li
              key={flag.code}
              className={styles.flagItem}
              style={
                {
                  left: `calc(50% + (${cos} * var(--gls-ring-radius, 68px)))`,
                  top: `calc(50% + (${sin} * var(--gls-ring-radius, 68px)))`,
                  // 配列順（＝時計回り）に段階的な z-index を与えることで、隣り合う
                  // 国旗どうしが常に「片側の隣より上・反対側の隣より下」になる編み込み状
                  // の重なりが連続する。ただし z-index は循環する順序を表現できないため、
                  // 最後（フィリピン、z-index最大）と最初（日本、z-index最小）の境界だけは
                  // このままだと逆転する（日本が両側から覆われて見える）。この1箇所だけは
                  // フィリピン側に CSS mask で穴を開けて見た目を補正する
                  // （styles.flagButton の [data-code='fil'] ルール参照）。
                  zIndex: index + 1,
                } as CSSProperties
              }
              data-state={state}
              data-code={flag.code}
            >
              <button
                type="button"
                className={styles.flagButton}
                aria-pressed={highlightedLang === flag.lang}
                aria-label={flag.label}
                title={flag.label}
                onClick={() => selectLang(flag.lang)}
              >
                <Image
                  src={`/flags/${flag.icon}.svg`}
                  alt=""
                  // 実際の最大表示サイズ（PC基準、約42px）に余裕を持たせた解像度。
                  width={68}
                  height={68}
                  className={styles.flagIcon}
                />
              </button>
            </li>
          );
        })}
      </ul>

      {/* 見た目には出さない、ポインター操作専用の判定レイヤー。円形にクリップして
         いるため、円の外（正方形の四隅）のクリックはそのまま下（地球儀イラストや
         ページの他要素）へ通る。実際の選択・キーボード操作は上の12個の実ボタン
         （と地球儀ボタン）が担う。 */}
      <div className={styles.hitLayer} aria-hidden="true" onClick={handleRingClick} />
    </div>
  );
}
