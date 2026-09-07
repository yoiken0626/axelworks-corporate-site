'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { resolveLang, type Lang } from './lang';

export type ReadAloudStatus = 'idle' | 'playing' | 'paused';

export const READ_ALOUD_MIN_RATE = 0.75;
export const READ_ALOUD_MAX_RATE = 1.5;

// 1チャンクの最大バイト数。Google TTS の実上限（5000バイト）に対して十分小さくし、
// 最初の音が鳴るまでの待ち時間も短くする。日本語で概ね 400〜500 文字。
const CHUNK_BYTES = 1400;

// 口パクのトグル間隔（ms）。再生位置が進んでいる間だけ開閉を繰り返す。
const MOUTH_PULSE_MS = 150;
// currentTime がこの回数連続で進まなければ「音が止まった」とみなして口を閉じる
const STALL_TICKS = 3;

// iOS Safari 対策: fetch を挟むと後続の audio.play() がユーザー操作外とみなされ拒否される。
// 最初の操作時にこの無音を同期再生して <audio> をアンロックしておく。
const SILENT_WAV =
  'data:audio/wav;base64,UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YSADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

const encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
const byteLen = (s: string): number => (encoder ? encoder.encode(s).length : s.length);

const splitSentences = (text: string): string[] =>
  text
    .split(/(?<=[。．.!?！？\n])/)
    .map((s) => s.trim())
    .filter(Boolean);

// 文の配列を、CHUNK_BYTES に収まる読み上げ単位へまとめ直す。
// 1文が単独で予算を超える場合は句読点・空白を優先して強制分割する。
const buildChunks = (sentences: string[]): string[] => {
  const chunks: string[] = [];
  let current = '';

  const flush = () => {
    const trimmed = current.trim();
    if (trimmed) chunks.push(trimmed);
    current = '';
  };

  const pushLongPiece = (piece: string) => {
    let rest = piece;
    while (byteLen(rest) > CHUNK_BYTES) {
      let cut = rest.length;
      while (cut > 1 && byteLen(rest.slice(0, cut)) > CHUNK_BYTES) {
        cut -= 8;
      }
      const head = rest.slice(0, cut);
      const breakAt = Math.max(
        head.lastIndexOf('、'),
        head.lastIndexOf('，'),
        head.lastIndexOf(' '),
        head.lastIndexOf('\n'),
      );
      const at = breakAt > cut * 0.5 ? breakAt + 1 : cut;
      chunks.push(rest.slice(0, at).trim());
      rest = rest.slice(at);
    }
    return rest;
  };

  for (const sentence of sentences) {
    let piece = sentence;
    if (byteLen(piece) > CHUNK_BYTES) {
      flush();
      piece = pushLongPiece(piece);
    }
    if (current && byteLen(current) + byteLen(piece) + 1 > CHUNK_BYTES) {
      flush();
    }
    current = current ? `${current}\n${piece}` : piece;
  }
  flush();
  return chunks;
};

/**
 * Google Cloud Text-to-Speech（/api/tts）で音声を取得し、<audio> 要素で
 * 順に再生する読み上げフック。
 * - 対応言語すべて（日 / 英 / 韓 / 中 / 独 / 仏 / 西 / 露）で動作（ブラウザや OS のボイスに依存しない）
 * - play / pause / stop と速度変更（0.75〜1.5x, audio.playbackRate）
 * - mouthOpen: <audio> の再生状態（play / pause / ended）と currentTime の進行に同期。
 *   音が止まっている間は必ず口を閉じる（Android Chrome で音だけ消えて口パクが
 *   続く不具合への対策）
 */
export function useReadAloud(segments: string[], lang: Lang) {
  const [status, setStatus] = useState<ReadAloudStatus>('idle');
  const [rate, setRate] = useState(1);
  const [mouthOpen, setMouthOpen] = useState(false);

  const wantLang = resolveLang(lang);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rateRef = useRef(rate);
  rateRef.current = rate;

  // 再生をやり直すたびに増やし、進行中の非同期処理（fetch / play）を無効化する
  const genRef = useRef(0);
  const chunksRef = useRef<string[]>([]);
  const chunkIdxRef = useRef(0);
  const unlockedRef = useRef(false);
  // チャンク index -> Object URL（MP3 Blob）。言語 / 本文が変わると破棄する
  const urlCacheRef = useRef<Map<number, string>>(new Map());

  const sentences = useMemo(
    () => segments.flatMap(splitSentences),
    // segments は配列なので中身で依存を判定
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [segments.join('')],
  );

  const revokeUrls = useCallback(() => {
    urlCacheRef.current.forEach((url) => URL.revokeObjectURL(url));
    urlCacheRef.current.clear();
  }, []);

  // 指定チャンクの音声を取得して Object URL を返す（取得済みなら再利用）
  const fetchChunk = useCallback(
    async (idx: number, gen: number): Promise<string | null> => {
      const cached = urlCacheRef.current.get(idx);
      if (cached) return cached;

      const text = chunksRef.current[idx];
      if (!text) return null;

      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, lang: wantLang }),
      });
      if (gen !== genRef.current) return null;
      if (!res.ok) {
        throw new Error(`/api/tts responded ${res.status}`);
      }
      const blob = await res.blob();
      if (gen !== genRef.current) return null;

      const url = URL.createObjectURL(blob);
      urlCacheRef.current.set(idx, url);
      return url;
    },
    [wantLang],
  );

  // idx 番目のチャンクを取得して再生する。成功したら次のチャンクを先読みする。
  const playFrom = useCallback(
    async (idx: number, gen: number) => {
      const audio = audioRef.current;
      if (!audio) return;

      let url: string | null;
      try {
        url = await fetchChunk(idx, gen);
      } catch (error) {
        console.error('[useReadAloud] failed to fetch audio', error);
        if (gen === genRef.current) {
          setStatus('idle');
          setMouthOpen(false);
        }
        return;
      }
      if (gen !== genRef.current || !url) return;

      chunkIdxRef.current = idx;
      audio.src = url;
      audio.playbackRate = rateRef.current;
      try {
        await audio.play();
      } catch {
        // 別の play() や pause() に割り込まれた（AbortError）。gen チェック側で処理済み。
        return;
      }
      if (gen !== genRef.current) return;
      setStatus('playing');

      // 次チャンクを先読み（失敗しても本再生には影響させない）
      void fetchChunk(idx + 1, gen).catch(() => {});
    },
    [fetchChunk],
  );

  const playFromRef = useRef(playFrom);
  playFromRef.current = playFrom;

  // <audio> 要素は一度だけ生成し、イベントリスナは最新クロージャを ref 経由で呼ぶ
  useEffect(() => {
    if (typeof Audio === 'undefined') return;
    const audio = new Audio();
    audio.preload = 'auto';
    audioRef.current = audio;

    const handleEnded = () => {
      const next = chunkIdxRef.current + 1;
      if (next < chunksRef.current.length) {
        void playFromRef.current(next, genRef.current);
      } else {
        setStatus('idle');
        chunkIdxRef.current = 0;
        setMouthOpen(false);
      }
    };
    const handleError = () => {
      // src を外して load() したときの空ソースエラーは無視する
      if (!audio.getAttribute('src')) return;
      genRef.current += 1;
      setStatus('idle');
      chunkIdxRef.current = 0;
      setMouthOpen(false);
    };

    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);
    return () => {
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      audioRef.current = null;
    };
  }, []);

  // 言語 / 本文が変わったら再生を止めてキャッシュを破棄する
  useEffect(() => {
    return () => {
      genRef.current += 1;
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
      }
      chunkIdxRef.current = 0;
      revokeUrls();
      setStatus('idle');
      setMouthOpen(false);
    };
  }, [sentences, wantLang, revokeUrls]);

  // 口パク: 再生中かつ currentTime が進んでいる間だけ開閉を繰り返す。
  // pause / ended / 音の停止（currentTime 据え置き）では必ず閉じる。
  useEffect(() => {
    if (status !== 'playing') {
      setMouthOpen(false);
      return;
    }
    let lastTime = -1;
    let stalled = 0;
    const id = window.setInterval(() => {
      const audio = audioRef.current;
      if (!audio || audio.paused || audio.ended) {
        setMouthOpen(false);
        return;
      }
      if (audio.currentTime === lastTime) {
        stalled += 1;
        if (stalled >= STALL_TICKS) {
          setMouthOpen(false);
          return;
        }
      } else {
        stalled = 0;
        lastTime = audio.currentTime;
      }
      setMouthOpen((open) => !open);
    }, MOUTH_PULSE_MS);
    return () => {
      window.clearInterval(id);
      setMouthOpen(false);
    };
  }, [status]);

  const play = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // 一時停止からの再開: 同じチャンクを続きから
    if (status === 'paused' && audio.src) {
      const gen = (genRef.current += 1);
      audio.playbackRate = rateRef.current;
      audio
        .play()
        .then(() => {
          if (gen === genRef.current) setStatus('playing');
        })
        .catch(() => {});
      return;
    }

    // 新規再生
    const gen = (genRef.current += 1);
    chunksRef.current = buildChunks(sentences);
    chunkIdxRef.current = 0;
    if (chunksRef.current.length === 0) return;
    setStatus('playing');
    void playFrom(0, gen);
  }, [status, sentences, playFrom]);

  const pause = useCallback(() => {
    if (status !== 'playing') return;
    const audio = audioRef.current;
    if (!audio) return;
    genRef.current += 1; // 先読み等の保留処理を無効化
    audio.pause();
    setStatus('paused');
    setMouthOpen(false);
  }, [status]);

  const stop = useCallback(() => {
    genRef.current += 1;
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    chunkIdxRef.current = 0;
    setStatus('idle');
    setMouthOpen(false);
  }, []);

  // 最初のユーザー操作（クリック）中に同期的に呼び、<audio> を再生可能状態にする
  const unlockAudio = useCallback(() => {
    if (unlockedRef.current) return;
    const audio = audioRef.current;
    if (!audio) return;
    unlockedRef.current = true;
    audio.src = SILENT_WAV;
    audio
      .play()
      .then(() => {
        // すでに本編の音声に差し替わっていたら何もしない（レース対策）
        if (audio.getAttribute('src') !== SILENT_WAV) return;
        audio.pause();
        audio.currentTime = 0;
        audio.removeAttribute('src');
      })
      .catch(() => {});
  }, []);

  const toggle = useCallback(() => {
    if (status === 'playing') {
      pause();
    } else {
      unlockAudio();
      play();
    }
  }, [status, play, pause, unlockAudio]);

  const changeRate = useCallback((next: number) => {
    const clamped = Math.min(READ_ALOUD_MAX_RATE, Math.max(READ_ALOUD_MIN_RATE, next));
    setRate(clamped);
    rateRef.current = clamped;
    // <audio> の playbackRate は再生中でも即時反映される
    if (audioRef.current) audioRef.current.playbackRate = clamped;
  }, []);

  // タブ非表示・ページ離脱で読み上げを止めて口を閉じる
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stopAll = () => {
      genRef.current += 1;
      const audio = audioRef.current;
      if (audio) audio.pause();
      chunkIdxRef.current = 0;
      setStatus('idle');
      setMouthOpen(false);
    };
    const onVisibility = () => {
      if (document.hidden) stopAll();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', stopAll);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', stopAll);
    };
  }, []);

  return {
    status,
    speaking: status === 'playing',
    mouthOpen,
    rate,
    setRate: changeRate,
    toggle,
    stop,
  };
}
