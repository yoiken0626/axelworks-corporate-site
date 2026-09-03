'use client';

import { useEffect, useState } from 'react';
import GlobeLanguageSwitcher from '@/app/_components/GlobeLanguageSwitcher';
import styles from './index.module.css';

/**
 * ContactSection（#contact-form）が画面に入っている間だけ、
 * 画面右上に固定表示する地球儀言語スイッチャー。
 * ヒーロー内の地球儀とは別インスタンス。
 */
export default function ContactGlobe() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const target = document.getElementById('contact-form');
    if (!target || typeof IntersectionObserver === 'undefined') return;

    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      rootMargin: '-12% 0px -12% 0px',
    });
    io.observe(target);
    return () => io.disconnect();
  }, []);

  return (
    <div className={styles.fixed} data-visible={visible} aria-hidden={!visible}>
      <GlobeLanguageSwitcher className={styles.globe} />
    </div>
  );
}
