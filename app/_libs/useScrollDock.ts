'use client';

import { useEffect, useState } from 'react';
import { SCROLL_DOCK_SENTINEL_ID } from './scroll-dock';

/**
 * `SCROLL_DOCK_SENTINEL_ID` の目印が画面上端より上へスクロールされたら true を返す。
 * PageReadAloud（記事・ニュース一覧）とトップページの両方で使う共通ロジック。
 */
export function useScrollDock(): boolean {
  const [docked, setDocked] = useState(false);

  useEffect(() => {
    const sentinel = document.getElementById(SCROLL_DOCK_SENTINEL_ID);
    if (!sentinel || typeof IntersectionObserver === 'undefined') return;

    const io = new IntersectionObserver(
      ([entry]) => {
        setDocked(!entry.isIntersecting && entry.boundingClientRect.top < 0);
      },
      { threshold: 0 },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, []);

  return docked;
}
