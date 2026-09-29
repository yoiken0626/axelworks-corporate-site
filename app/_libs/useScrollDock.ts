'use client';

import { useEffect, useState } from 'react';

// スクロール位置がこの値を超えたら「ドック」状態にする。0に近い小さな値にして
// おくことで、ページの長さ（本文の分量）に関係なく、スクロールを始めた
// 直後に確実にドックへ切り替わるようにする（以前は本文中の特定の目印
// <div id="...dock-sentinel"> を IntersectionObserver で監視していたが、
// 12国旗の常時展開リングに合わせて上部の余白（padding-top）を広げた結果、
// 本文の短いページ（/company 等）ではその目印までスクロールが届かず、
// ドックへ永久に切り替わらない不具合があったため撤廃した）。
const DOCK_THRESHOLD_PX = 24;

/**
 * スクロール位置が DOCK_THRESHOLD_PX を超えたら true を返す。
 * PageReadAloud（地球儀・読み上げ UI）が「ヘッダー付近の帯」から
 * 「画面最上部へせり上げた位置」へ切り替えるために使う。
 */
export function useScrollDock(): boolean {
  const [docked, setDocked] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setDocked(window.scrollY > DOCK_THRESHOLD_PX);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return docked;
}
