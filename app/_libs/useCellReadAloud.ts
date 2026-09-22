'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { type Lang } from './lang';
import { SILENT_WAV } from './useReadAloud';

// セル音声キャッシュ（テキスト＋言語ごと）の合計サイズの上限。/image100 のセルは
// 短い一文だけなので、本編の読み上げ（30MB）よりずっと小さい上限で十分。
const CELL_CACHE_BYTE_CAP = 10 * 1024 * 1024; // 10MB

/**
 * /image100 の「セルをクリックして計算式を読み上げる」機能専用の、軽量な読み上げフック。
 *
 * 本編（見出しの読み上げ・useReadAloud）とは完全に独立した、別の <audio> 要素を持つ
 * （チャンク分割・繰り返し・口パク等は不要なため、あの重いフックを流用せず単独で持つ）。
 *
 * - 同じテキスト＋言語の組み合わせは、テキストをキー（`lang::text`）にキャッシュした
 *   Object URL を再利用し、/api/tts を呼び直さない（同じセルを何度クリックしても
 *   1回しか課金対象の呼び出しをしない）。
 * - セルを連続してクリックした場合は「後から押した方を優先する」設計にした
 *   （前の再生・取得を打ち切り、新しいセルを再生する。読み上げ中の本編と同様、
 *   キューには積まない）。世代カウンタ（genRef）で、古いクリックの非同期処理が
 *   後から届いても無視されるようにする。
 * - iOS Safari 対策は useReadAloud と同じ手法（同じ <audio> 要素で無音を鳴らして
 *   アンロックしてから、本番の src に差し替える）を、最初のクリック時にだけ行う。
 */
export function useCellReadAloud() {
  const [activeCellKey, setActiveCellKey] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const genRef = useRef(0);
  const cacheRef = useRef<Map<string, string>>(new Map());
  const cacheBytesRef = useRef(0);
  const unlockedRef = useRef(false);
  // 上限超過でキャッシュしなかった URL（再生し終わったら不要になるので破棄する）
  const uncachedUrlRef = useRef<string | null>(null);

  const revokeUncached = useCallback(() => {
    if (uncachedUrlRef.current) {
      URL.revokeObjectURL(uncachedUrlRef.current);
      uncachedUrlRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (typeof Audio === 'undefined') return;
    const audio = new Audio();
    audio.preload = 'auto';
    audioRef.current = audio;

    const clearActive = () => {
      setActiveCellKey(null);
      revokeUncached();
    };
    const handleEnded = () => clearActive();
    const handleError = () => {
      if (!audio.getAttribute('src')) return; // アンロック解除等の空 src エラーは無視
      clearActive();
    };
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    const cache = cacheRef.current;
    return () => {
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      audioRef.current = null;
      cache.forEach((url) => URL.revokeObjectURL(url));
      cache.clear();
      cacheBytesRef.current = 0;
      revokeUncached();
    };
  }, [revokeUncached]);

  const playCell = useCallback((cellKey: string, text: string, lang: Lang) => {
    const audio = audioRef.current;
    if (!audio) return;

    // iOS Safari 対策: 最初のクリック（＝ユーザー操作の直後）にだけ、同じ要素で
    // 無音を同期再生してアンロックする（詳細は useReadAloud.ts の unlockAudio コメント参照）。
    if (!unlockedRef.current) {
      unlockedRef.current = true;
      audio.src = SILENT_WAV;
      audio.play().catch(() => {});
    }

    const gen = (genRef.current += 1);
    const cacheKey = `${lang}::${text}`;

    const start = (url: string, isUncached: boolean) => {
      if (gen !== genRef.current) return;
      revokeUncached(); // 前のセルが上限超過で未キャッシュだった場合、ここで破棄する
      if (isUncached) uncachedUrlRef.current = url;
      audio.src = url;
      setActiveCellKey(cellKey);
      audio.play().catch(() => {
        if (gen === genRef.current) setActiveCellKey(null);
      });
    };

    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      start(cached, false);
      return;
    }

    void (async () => {
      let res: Response;
      try {
        res = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text, lang }),
        });
      } catch (error) {
        console.error('[useCellReadAloud] failed to reach /api/tts', error);
        return;
      }
      if (gen !== genRef.current || !res.ok) return;

      let blob: Blob;
      try {
        blob = await res.blob();
      } catch (error) {
        console.error('[useCellReadAloud] failed to read tts response body', error);
        return;
      }
      if (gen !== genRef.current) return;

      const url = URL.createObjectURL(blob);
      const fitsInCache = cacheBytesRef.current + blob.size <= CELL_CACHE_BYTE_CAP;
      if (fitsInCache) {
        cacheBytesRef.current += blob.size;
        cacheRef.current.set(cacheKey, url);
      }
      start(url, !fitsInCache);
    })();
  }, [revokeUncached]);

  return { activeCellKey, playCell };
}
