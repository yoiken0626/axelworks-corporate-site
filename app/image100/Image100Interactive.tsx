'use client';

import { useState } from 'react';
import { ui } from '@/app/_libs/ui-strings';
import { NUMBER_WORDS } from '@/app/_libs/number-words';
import { type Lang } from '@/app/_libs/lang';
import PageReadAloud from '@/app/_components/PageReadAloud';
import styles from './page.module.css';

type Props = {
  lang: Lang;
  /** サーバー側（page.tsx）で、リクエストごとに生成した乱数。SSRの初期HTMLと一致させるため
      useState の初期値としてのみ使う（詳細はコンポーネント内のコメントを参照）。 */
  initialHorizontalDigits: number[];
  initialVerticalDigits: number[];
};

/**
 * 表（横縦の見出し・100マス）と、読み上げ（PageReadAloud）をまとめて持つクライアント
 * コンポーネント。
 *
 * 横縦の数字は、初回マウント時の値で固定する（useState の初期値は最初の1回しか
 * 使われない）。言語切り替え（GlobeLanguageSwitcher の router.refresh()）は、親の
 * Server Component（page.tsx）を再実行し、新しい乱数を props として渡してくるが、
 * ここでは無視され、数字は変わらない。真にページを開き直したとき（このコンポーネント
 * 自体が再マウントされたとき）だけ、新しい乱数を受け取る。
 *
 * 訳語（NUMBER_WORDS）と読み上げ（segments・PageReadAloud の lang）は、固定した数字＋
 * 都度渡される最新の lang から毎回作り直すため、言語切り替えに正しく追従する。
 */
export default function Image100Interactive({ lang, initialHorizontalDigits, initialVerticalDigits }: Props) {
  const [horizontalDigits] = useState(initialHorizontalDigits);
  const [verticalDigits] = useState(initialVerticalDigits);
  const words = NUMBER_WORDS[lang];

  // 読み上げ対象：見出し＋「横見出し10個→縦見出し10個」の合計20個の数字だけ
  // （使い方の紹介文・リード文は対象に含めない）。
  const segments = [
    ui('image100Heading', lang),
    ...horizontalDigits.map((d) => String(d)),
    ...verticalDigits.map((d) => String(d)),
  ];

  return (
    <>
      <PageReadAloud lang={lang} segments={segments} />

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          {/* caption は表の説明（スクリーンリーダー向け）。読み上げ・ハイライトの対象では
              ないよう、data-read-aloud-body は thead/tbody にだけ付ける（caption には
              「100」等の数字を含むため、付けると数字のハイライト照合を誤らせてしまう）。 */}
          <caption className="srOnly">{ui('image100TableCaption', lang)}</caption>
          <thead data-read-aloud-body>
            <tr>
              <th scope="col" className={styles.cornerCell} aria-hidden="true" />
              {horizontalDigits.map((d, i) => (
                <th scope="col" key={`h-${i}`} className={styles.headingCell}>
                  <span className={styles.numeral}>{d}</span>
                  <span className={styles.word}>{words[d]}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody data-read-aloud-body>
            {verticalDigits.map((vd, rowIdx) => (
              <tr key={`row-${rowIdx}`}>
                <th scope="row" className={styles.headingCell}>
                  <span className={styles.numeral}>{vd}</span>
                  <span className={styles.word}>{words[vd]}</span>
                </th>
                {horizontalDigits.map((_, colIdx) => (
                  <td key={`cell-${rowIdx}-${colIdx}`} className={styles.emptyCell} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
