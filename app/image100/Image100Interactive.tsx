'use client';

import { useState } from 'react';
import { ui } from '@/app/_libs/ui-strings';
import { NUMBER_WORDS } from '@/app/_libs/number-words';
import { type Lang } from '@/app/_libs/lang';
import { DIGITS_0_TO_9, shuffle } from '@/app/_libs/shuffle';
import { type Operator, OPERATOR_WORD, buildCalcSpeechText } from '@/app/_libs/image100-calc-speech';
import { useCellReadAloud } from '@/app/_libs/useCellReadAloud';
import PageReadAloud from '@/app/_components/PageReadAloud';
import styles from './page.module.css';

type Mode = 'random' | 'kuku';

// 「九九」モードの固定順（0〜9）。モジュールスコープの単一の配列を使い回すことで、
// 「九九」ボタンを何度押しても常に同じ参照・同じ値になる（何も変わらない）ことを保証する。
const KUKU_ORDER: number[] = [...DIGITS_0_TO_9];

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
 * 横縦の数字は、初回マウント時の値（＝「ランダム」モード）で固定する（useState の
 * 初期値は最初の1回しか使われない）。言語切り替え（GlobeLanguageSwitcher の
 * router.refresh()）は、親の Server Component（page.tsx）を再実行し、新しい乱数を
 * props として渡してくるが、ここでは無視され、数字は変わらない。真にページを開き
 * 直したとき（このコンポーネント自体が再マウントされたとき）だけ、新しい乱数を
 * 受け取り、モードも必ず「ランダム」に戻る。
 *
 * モード切り替え（「ランダム」「九九」ボタン）は、この横縦の数字を上書きするだけ。
 * 「ランダム」は毎回シャッフルし直す。「九九」は常に同じ固定順（0〜9）を入れるため、
 * 連打しても値は変わらない。数字が実際に変わると、PageReadAloud に渡す segments の
 * 中身も変わり、useReadAloud 内部の cleanup effect（chunkTexts の変化を見ている）が
 * 発火して再生中の読み上げを自動的に停止するので、切り替え側で明示的に「止める」処理を
 * 呼ぶ必要はない。
 *
 * 訳語（NUMBER_WORDS）と読み上げ（segments・PageReadAloud の lang）は、都度渡される
 * 最新の lang から毎回作り直すため、言語切り替えに正しく追従する。
 *
 * セルクリックの計算読み上げ（useCellReadAloud）は、見出しの読み上げ（PageReadAloud /
 * useReadAloud）とは別の <audio> 要素を持つ、完全に独立した仕組み。演算子（operator）は
 * mode と同じく、このコンポーネント自身のローカル state（初期値は常に「＋」、
 * localStorage には保存しない）にする。router.refresh() ではこのコンポーネント自体は
 * 再マウントされない（mode が言語切り替えで保持されることは既に確認済み）ため、
 * 素の useState だけで「開いている間だけ保持・開き直したら既定値に戻る」を満たせる。
 */
export default function Image100Interactive({ lang, initialHorizontalDigits, initialVerticalDigits }: Props) {
  const [mode, setMode] = useState<Mode>('random');
  const [operator, setOperator] = useState<Operator>('add');
  const [horizontalDigits, setHorizontalDigits] = useState(initialHorizontalDigits);
  const [verticalDigits, setVerticalDigits] = useState(initialVerticalDigits);
  const words = NUMBER_WORDS[lang];
  const { activeCellKey, playCell } = useCellReadAloud();

  const handleRandom = () => {
    setMode('random');
    setHorizontalDigits(shuffle(DIGITS_0_TO_9));
    setVerticalDigits(shuffle(DIGITS_0_TO_9));
  };

  const handleKuku = () => {
    setMode('kuku');
    setHorizontalDigits(KUKU_ORDER);
    setVerticalDigits(KUKU_ORDER);
  };

  // セルクリック：横 h・縦 v・今選んでいる演算子から読み上げ文を作り、/api/tts で再生する
  // （テキスト＋言語が同じなら useCellReadAloud 内でキャッシュされ、再取得しない）。
  // 引き算は「横（列） − 縦（行）」で統一する。
  const handleCellClick = (rowIdx: number, colIdx: number, h: number, v: number) => {
    const text = buildCalcSpeechText(h, v, operator, lang);
    playCell(`${rowIdx}-${colIdx}`, text, lang);
  };

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

      <div className={styles.modeToggle} role="group" aria-label={ui('image100ModeLabel', lang)}>
        <button
          type="button"
          className={styles.modeButton}
          aria-pressed={mode === 'random'}
          onClick={handleRandom}
        >
          {ui('image100ModeRandom', lang)}
        </button>
        <button
          type="button"
          className={styles.modeButton}
          aria-pressed={mode === 'kuku'}
          onClick={handleKuku}
        >
          {ui('image100ModeKuku', lang)}
        </button>

        <select
          className={styles.operatorSelect}
          aria-label={ui('image100OperatorLabel', lang)}
          value={operator}
          onChange={(e) => setOperator(e.target.value as Operator)}
        >
          <option value="add">＋</option>
          <option value="sub">−</option>
          <option value="mul">×</option>
          <option value="div">÷</option>
        </select>
      </div>

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
                {horizontalDigits.map((hd, colIdx) => {
                  const cellKey = `${rowIdx}-${colIdx}`;
                  // 割り算で縦(vd)が0のときは「0で割る」ため、答えが存在しないことを
                  // 案内する専用の aria-label にする（このセル自体はほかと同じく押せる）。
                  const ariaLabelKey =
                    operator === 'div' && vd === 0 ? 'image100CellPlayNoAnswerAriaLabel' : 'image100CellPlayAriaLabel';
                  const ariaLabel = ui(ariaLabelKey, lang)
                    .replace('{h}', String(hd))
                    .replace('{op}', OPERATOR_WORD[operator][lang])
                    .replace('{v}', String(vd));
                  return (
                    <td key={`cell-${rowIdx}-${colIdx}`} className={styles.emptyCell}>
                      <button
                        type="button"
                        className={`${styles.cellButton} ${activeCellKey === cellKey ? styles.cellButtonActive : ''}`}
                        aria-label={ariaLabel}
                        onClick={() => handleCellClick(rowIdx, colIdx, hd, vd)}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
