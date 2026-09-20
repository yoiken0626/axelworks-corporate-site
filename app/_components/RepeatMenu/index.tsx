'use client';

import { useEffect, useLayoutEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ui } from '@/app/_libs/ui-strings';
import { type Lang } from '@/app/_libs/lang';
import { REPEAT_OPTIONS, DEFAULT_REPEAT_COUNT } from '@/app/_libs/useReadAloud';
import styles from './index.module.css';

type RepeatOption = (typeof REPEAT_OPTIONS)[number];

const STORAGE_KEY = 'axelworks:readAloudRepeatCount';

// 前回選んだ回数を読む。保存が無い/壊れている/選択肢に無い値なら既定値（6回）。
// localStorage が使えない環境（プライベートブラウズ等）でも例外を投げず既定値にする。
const readStoredCount = (): RepeatOption | typeof DEFAULT_REPEAT_COUNT => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const n = raw ? Number(raw) : NaN;
    return (REPEAT_OPTIONS as readonly number[]).includes(n) ? (n as RepeatOption) : DEFAULT_REPEAT_COUNT;
  } catch {
    return DEFAULT_REPEAT_COUNT;
  }
};

const writeStoredCount = (count: number): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(count));
  } catch {
    // localStorage が使えなくても動作には影響させない（表示上の「印」が次回出ないだけ）
  }
};

const RepeatIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v5z" />
  </svg>
);

// 画面端でメニューが切れないようにするための余白（px）
const VIEWPORT_MARGIN = 8;
// ボタンとメニューの間隔（px）
const MENU_GAP = 4;

type Props = {
  lang: Lang;
  /** 既存の .iconButton .repeatButton 相当のクラス（呼び出し側の CSS Module から渡す） */
  buttonClassName: string;
  /** 繰り返し中の周（0 = 繰り返し無効）。ボタンの表示・動作の分岐に使う */
  repeatLap: number;
  /** 音声キャッシュが上限超過で繰り返しを提供できないか */
  cacheCapped: boolean;
  /** メニューで回数を選んだとき（クリックイベント内で同期的に呼ばれる） */
  onStart: (count: number) => void;
  /** 繰り返し中にボタンが押されたとき（メニューは開かず、今の周で止める） */
  onStop: () => void;
};

/**
 * 読み上げの「繰り返し」ボタン + 回数選択メニュー。
 * トップページ（HeroSection）と記事ページ（PageReadAloud）で共通の見た目・動作にするため
 * ここに集約する（ボタンの色・サイズは呼び出し側の CSS Module のクラスをそのまま使う）。
 *
 * - 停止中 / 再生中に押す: メニューを開くだけ（音声処理は一切しない）
 * - メニューの項目を選ぶ: 同じクリックイベント内で同期的に onStart を呼ぶ
 *   （iOS Safariはユーザー操作の直後でないと audio.play() を許可しないため、
 *   setTimeout やアニメーション待ちを挟まない）
 * - 繰り返し中に押す: メニューを開かず onStop を呼ぶ
 */
export default function RepeatMenu({ lang, buttonClassName, repeatLap, cacheCapped, onStart, onStop }: Props) {
  const [open, setOpen] = useState(false);
  const [markedCount, setMarkedCount] = useState<number>(DEFAULT_REPEAT_COUNT);
  const [placement, setPlacement] = useState({ top: 0, left: 0, ready: false });

  const menuId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const closeMenu = (refocusButton: boolean) => {
    setOpen(false);
    if (refocusButton) buttonRef.current?.focus();
  };

  const handleTriggerClick = () => {
    if (repeatLap > 0) {
      onStop();
      return;
    }
    setMarkedCount(readStoredCount());
    setOpen((prev) => !prev);
  };

  const handleSelect = (count: number) => {
    // メニューを閉じるのは React state（非同期に反映されてよい）。
    // onStart は今のクリックイベント内で同期的に呼ぶ（iOS Safari 対策）。
    setOpen(false);
    writeStoredCount(count);
    onStart(count);
  };

  // 開いたら位置を計算する。ボタンの下に十分な余白が無ければ上に開く。
  // 左右は画面端で切れないようクランプする。
  useLayoutEffect(() => {
    if (!open) {
      setPlacement((p) => (p.ready ? { ...p, ready: false } : p));
      return;
    }
    const btn = buttonRef.current;
    const menu = menuRef.current;
    if (!btn || !menu) return;

    const btnRect = btn.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const spaceBelow = vh - btnRect.bottom;
    const spaceAbove = btnRect.top;
    const openAbove = spaceBelow < menuRect.height + VIEWPORT_MARGIN && spaceAbove > spaceBelow;

    let top = openAbove ? btnRect.top - menuRect.height - MENU_GAP : btnRect.bottom + MENU_GAP;
    top = Math.max(VIEWPORT_MARGIN, Math.min(top, vh - menuRect.height - VIEWPORT_MARGIN));

    // ボタンの右端に揃えつつ、画面外へはみ出さないようクランプする
    let left = btnRect.right - menuRect.width;
    left = Math.max(VIEWPORT_MARGIN, Math.min(left, vw - menuRect.width - VIEWPORT_MARGIN));

    setPlacement({ top, left, ready: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 位置が確定して visibility: visible になった後（＝実際にフォーカス可能になって
  // から）、印の付いた項目（無ければ先頭）へフォーカスする。上の位置計算と同じ
  // effect内で focus() すると、まだ visibility: hidden なコミット前の DOM に対して
  // 呼ぶことになり、ブラウザ側で無視されてしまう（hidden な要素はフォーカスできない）。
  useLayoutEffect(() => {
    if (!open || !placement.ready) return;
    const options = REPEAT_OPTIONS as readonly number[];
    const markedIndex = options.indexOf(markedCount);
    itemRefs.current[markedIndex >= 0 ? markedIndex : 0]?.focus();
    // markedCount は open した瞬間の値を使うだけでよい（依存に入れると開いたまま再計算されてしまう）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, placement.ready]);

  // 外側クリック / Esc / Tab / 矢印キーでの移動
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      closeMenu(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeMenu(true);
        return;
      }
      if (e.key === 'Tab') {
        // メニューの外へフォーカスが移るので、開いたままにしない
        closeMenu(false);
        return;
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const items = itemRefs.current.filter((el): el is HTMLButtonElement => el != null);
      if (items.length === 0) return;
      e.preventDefault();
      const currentIndex = items.findIndex((el) => el === document.activeElement);
      const delta = e.key === 'ArrowDown' ? 1 : -1;
      const nextIndex = (currentIndex + delta + items.length) % items.length;
      items[nextIndex]?.focus();
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const triggerLabel = repeatLap > 0 ? ui('readAloudRepeatStop', lang) : ui('readAloudRepeat', lang);

  return (
    <>
      <button
        type="button"
        ref={buttonRef}
        className={buttonClassName}
        onClick={handleTriggerClick}
        disabled={cacheCapped}
        title={cacheCapped ? ui('readAloudRepeatUnavailable', lang) : undefined}
        data-active={repeatLap > 0 ? 'true' : undefined}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={triggerLabel}
      >
        <RepeatIcon />
      </button>

      {open &&
        createPortal(
          // document.body へポータルする。.control に backdrop-filter が
          // 掛かっており、position:fixed の子孫はそのような祖先要素を
          // 包含ブロックにしてしまう（ビューポート基準にならない）ため、
          // 祖先の影響を受けない body 直下に描画して位置計算を単純にする。
          <div
            id={menuId}
            ref={menuRef}
            role="menu"
            aria-label={ui('readAloudRepeatMenuHeading', lang)}
            className={styles.menu}
            style={{
              top: placement.top,
              left: placement.left,
              visibility: placement.ready ? 'visible' : 'hidden',
            }}
          >
            {REPEAT_OPTIONS.map((count, i) => (
              <button
                key={count}
                type="button"
                role="menuitemradio"
                aria-checked={count === markedCount}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                tabIndex={-1}
                className={styles.menuItem}
                onClick={() => handleSelect(count)}
              >
                {ui('readAloudRepeatOption', lang).replace('{count}', String(count))}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
