'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { resolveLang, type Lang } from './lang';
import { SILENT_WAV } from './useReadAloud';
import {
  buildDictationSegments,
  type DictationBoundaryMode,
  type DictationSegment,
} from './dictation-segmenter';

export type PracticeMode = 'dictation'; // フェーズ1は手書きディクテーションのみ。将来 'typing' 等を追加できる形にしておく。
export type PracticeStatus = 'idle' | 'playing' | 'stopped' | 'finished' | 'error';

export const PRACTICE_MIN_RATE = 0.5;
export const PRACTICE_MAX_RATE = 1.0;
export const PRACTICE_DEFAULT_RATE = 0.8;
export const PRACTICE_RATE_STEP = 0.1;

const DEFAULT_BOUNDARY_MODE: DictationBoundaryMode = 'commaPeriod';
const BOUNDARY_STORAGE_KEY = 'axelworks:dictationBoundaryMode';
const RATE_STORAGE_KEY = 'axelworks:dictationRate';

// 既存の音声キャッシュ（useReadAloud.ts の CACHE_BYTE_CAP）と同じ考え方の上限。
// 練習モード専用の別インスタンスとして持つ（既存キャッシュとは独立）。
const CACHE_BYTE_CAP = 30 * 1024 * 1024;

const clampRate = (value: number): number => {
  const clamped = Math.min(PRACTICE_MAX_RATE, Math.max(PRACTICE_MIN_RATE, value));
  // 0.1刻みの丸め誤差（0.7999999...等）を吸収する
  return Math.round(clamped * 10) / 10;
};

const readStoredBoundaryMode = (): DictationBoundaryMode => {
  try {
    const raw = window.localStorage.getItem(BOUNDARY_STORAGE_KEY);
    return raw === 'commaPeriod' || raw === 'sentence' ? raw : DEFAULT_BOUNDARY_MODE;
  } catch {
    return DEFAULT_BOUNDARY_MODE;
  }
};

const writeStoredBoundaryMode = (mode: DictationBoundaryMode): void => {
  try {
    window.localStorage.setItem(BOUNDARY_STORAGE_KEY, mode);
  } catch {
    // localStorage が使えなくても動作には影響させない
  }
};

const readStoredRate = (): number => {
  try {
    const raw = window.localStorage.getItem(RATE_STORAGE_KEY);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? clampRate(n) : PRACTICE_DEFAULT_RATE;
  } catch {
    return PRACTICE_DEFAULT_RATE;
  }
};

const writeStoredRate = (rate: number): void => {
  try {
    window.localStorage.setItem(RATE_STORAGE_KEY, String(rate));
  } catch {
    // noop
  }
};

type WakeLockLike = { release: () => Promise<void> };

type Options = {
  /** 練習を開始するとき（初回の再生）に、通常の読み上げを止めるためのコールバック */
  onRequestExclusive?: () => void;
};

/**
 * 記事ページの「ディクテーション練習モード」フック。
 * 通常の読み上げ（useReadAloud）とは完全に別の <audio> 要素・別のキャッシュ・
 * 別の再生ロジックを持つ（設計理由は実装時の報告を参照）。
 *
 * 区間（セグメント）ごとに別々の音声を /api/tts で取得し、'ended' で自動的に止まる
 * （タイマーでは止めない）。次へ進むのは常にユーザーの操作（ボタン/キーボード）。
 */
export function usePracticeReadAloud(segments: string[], lang: Lang, options: Options = {}) {
  const wantLang = resolveLang(lang);
  const { onRequestExclusive } = options;

  const [isOpen, setIsOpen] = useState(false);
  const [mode] = useState<PracticeMode>('dictation');
  const [boundaryMode, setBoundaryModeState] = useState<DictationBoundaryMode>(DEFAULT_BOUNDARY_MODE);
  const [rate, setRateState] = useState(PRACTICE_DEFAULT_RATE);
  const [status, setStatus] = useState<PracticeStatus>('idle');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  // start/next/previous/restart など「実際に区間が切り替わった」ときだけ増える値
  // （もう一度・速度変更では増えない）。ハイライトの自動スクロールが「切り替わった
  // ときだけ動く」を判定するために使う（currentIndex 単独では、開始直後など値が
  // 変わらない場合に検知できないため）。
  const [moveSeq, setMoveSeq] = useState(0);
  const lastPlayedIndexRef = useRef<number | null>(null);

  // 初回マウント時に localStorage から復元する（SSR とのハイドレーション不一致を避けるため、
  // 既定値でレンダーしてから effect で上書きする。boundaryMode/rate は見た目にしか影響しない
  // ため、初回レンダーとの一瞬のズレは実害が無い）。
  useEffect(() => {
    setBoundaryModeState(readStoredBoundaryMode());
    setRateState(readStoredRate());
  }, []);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rateRef = useRef(rate);
  rateRef.current = rate;
  const genRef = useRef(0);
  const currentIndexRef = useRef(0);
  currentIndexRef.current = currentIndex;
  const unlockedRef = useRef(false);
  const wakeLockRef = useRef<WakeLockLike | null>(null);

  const urlCacheRef = useRef<Map<number, string>>(new Map());
  const cacheSizesRef = useRef<Map<number, number>>(new Map());
  const cacheBytesRef = useRef(0);
  const cacheOrderRef = useRef<number[]>([]); // 挿入順（distance-based eviction の対象選定に使う）
  const pendingFetchesRef = useRef<Map<string, Promise<string | null>>>(new Map());

  // isOpen で計算をゲートしない: open() 直後に先読みを仕掛けるとき、同期呼び出しの
  // 時点でまだ isOpen state が反映されていない（React の state 更新は非同期）ため、
  // ここをゲートすると先読みが空配列を掴んでしまう。テキスト処理は軽量なので常時計算する。
  const dictationSegments = useMemo<DictationSegment[]>(
    () => buildDictationSegments(segments, boundaryMode, wantLang),
    // segments は配列なので中身で依存を判定
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [segments.join(''), boundaryMode, wantLang],
  );
  const texts = useMemo(() => dictationSegments.map((s) => s.text), [dictationSegments]);

  const revokeAllUrls = useCallback(() => {
    urlCacheRef.current.forEach((url) => URL.revokeObjectURL(url));
    urlCacheRef.current.clear();
    cacheSizesRef.current.clear();
    cacheOrderRef.current = [];
    cacheBytesRef.current = 0;
  }, []);

  // 上限超過時: 現在位置から最も遠い区間のキャッシュから破棄する
  const evictIfNeeded = useCallback((incomingBytes: number, protectIdx: number) => {
    while (cacheBytesRef.current + incomingBytes > CACHE_BYTE_CAP && cacheOrderRef.current.length > 0) {
      let farthestPos = -1;
      let farthestDist = -1;
      cacheOrderRef.current.forEach((idx, pos) => {
        const dist = Math.abs(idx - protectIdx);
        if (dist > farthestDist) {
          farthestDist = dist;
          farthestPos = pos;
        }
      });
      if (farthestPos < 0) break;
      const [victimIdx] = cacheOrderRef.current.splice(farthestPos, 1);
      const url = urlCacheRef.current.get(victimIdx);
      if (url) {
        URL.revokeObjectURL(url);
        cacheBytesRef.current -= cacheSizesRef.current.get(victimIdx) ?? 0;
        cacheSizesRef.current.delete(victimIdx);
        urlCacheRef.current.delete(victimIdx);
      }
    }
  }, []);

  const fetchSegmentAudio = useCallback(
    (idx: number, gen: number): Promise<string | null> => {
      const cached = urlCacheRef.current.get(idx);
      if (cached) return Promise.resolve(cached);

      const key = `${gen}:${idx}`;
      const pending = pendingFetchesRef.current.get(key);
      if (pending) return pending;

      const request = (async (): Promise<string | null> => {
        const text = texts[idx];
        if (!text) return null;

        let res: Response;
        try {
          res = await fetch('/api/tts', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ text, lang: wantLang }),
          });
        } catch {
          throw new Error('failed to reach /api/tts');
        }
        if (gen !== genRef.current) return null;
        if (!res.ok) {
          throw new Error(`/api/tts responded ${res.status}`);
        }

        const blob = await res.blob();
        if (gen !== genRef.current) return null;
        const url = URL.createObjectURL(blob);

        evictIfNeeded(blob.size, currentIndexRef.current);
        cacheBytesRef.current += blob.size;
        cacheSizesRef.current.set(idx, blob.size);
        urlCacheRef.current.set(idx, url);
        cacheOrderRef.current = cacheOrderRef.current.filter((i) => i !== idx);
        cacheOrderRef.current.push(idx);

        return url;
      })();

      pendingFetchesRef.current.set(key, request);
      request
        .catch(() => {})
        .then(() => {
          if (pendingFetchesRef.current.get(key) === request) {
            pendingFetchesRef.current.delete(key);
          }
        });
      return request;
    },
    [texts, wantLang, evictIfNeeded],
  );

  // 「今の区間」+「先読みの次の区間（1つ先）」だけを取得する
  const prefetchAround = useCallback(
    (idx: number, gen: number) => {
      void fetchSegmentAudio(idx, gen).catch(() => {});
      if (idx + 1 < texts.length) {
        void fetchSegmentAudio(idx + 1, gen).catch(() => {});
      }
    },
    [fetchSegmentAudio, texts.length],
  );

  const requestWakeLock = useCallback(() => {
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    if (wakeLockRef.current) return;
    // 型: lib.dom の WakeLock API。非対応環境やユーザー操作外での拒否は無視する（エラーを出さない）。
    (navigator as unknown as { wakeLock: { request: (type: 'screen') => Promise<WakeLockLike> } }).wakeLock
      .request('screen')
      .then((sentinel) => {
        wakeLockRef.current = sentinel;
      })
      .catch(() => {
        // 非対応 / 拒否: 何もしない
      });
  }, []);

  const releaseWakeLock = useCallback(() => {
    const sentinel = wakeLockRef.current;
    wakeLockRef.current = null;
    if (sentinel) void sentinel.release().catch(() => {});
  }, []);

  const unlockAudio = useCallback(() => {
    if (unlockedRef.current) return;
    const audio = audioRef.current;
    if (!audio) return;
    unlockedRef.current = true;
    audio.src = SILENT_WAV;
    audio.play().catch(() => {
      // 無音再生自体が失敗しても、本編の再生開始時に再試行されるだけなので無視する
    });
  }, []);

  // idx の区間を再生する（開始・もう一度・次へ・前へ、すべてこれを呼ぶ）。
  // 呼び出し元のボタン onClick から同期的に呼ばれる前提（iOS Safari 対策）。
  const playIndex = useCallback(
    (idx: number) => {
      const audio = audioRef.current;
      if (!audio || idx < 0 || idx >= texts.length) return;

      onRequestExclusive?.();
      unlockAudio();
      requestWakeLock();

      const gen = genRef.current;
      const isNewPosition = lastPlayedIndexRef.current !== idx;
      lastPlayedIndexRef.current = idx;
      currentIndexRef.current = idx;
      setCurrentIndex(idx);
      setRevealed(false);
      setStatus('playing');
      if (isNewPosition) setMoveSeq((s) => s + 1);

      void fetchSegmentAudio(idx, gen)
        .then(async (url) => {
          if (gen !== genRef.current || !url) return;
          audio.src = url;
          audio.playbackRate = rateRef.current;
          await audio.play();
          if (gen !== genRef.current) return;
          setStatus('playing');
          prefetchAround(idx, gen);
        })
        .catch(() => {
          if (gen !== genRef.current) return;
          setStatus('error');
        });
    },
    [texts.length, onRequestExclusive, unlockAudio, requestWakeLock, fetchSegmentAudio, prefetchAround],
  );

  // gen は open()/resetState() 側で既に確定しているため、ここでは進めない
  // （open() 直後に仕掛けた idx=0 の先読みと、同じ gen キーを共有させるため。
  // ここで gen を進めてしまうと、先読み中の Promise とは別キーになり、
  // ユーザーがすぐ「開始」を押したときに /api/tts を二重に呼んでしまう）。
  const start = useCallback(() => {
    playIndex(0);
  }, [playIndex]);

  const replay = useCallback(() => {
    playIndex(currentIndexRef.current);
  }, [playIndex]);

  const next = useCallback(() => {
    const idx = currentIndexRef.current;
    if (idx + 1 < texts.length) {
      playIndex(idx + 1);
    }
  }, [playIndex, texts.length]);

  const previous = useCallback(() => {
    const idx = currentIndexRef.current;
    if (idx > 0) {
      playIndex(idx - 1);
    }
  }, [playIndex]);

  const toggleReveal = useCallback(() => {
    setRevealed((v) => !v);
  }, []);

  const restartFromBeginning = useCallback(() => {
    genRef.current += 1;
    currentIndexRef.current = 0;
    setCurrentIndex(0);
    setRevealed(false);
    setStatus('idle');
    // 既存キャッシュ（先頭付近は残っている可能性が高い）はそのまま再利用する
    prefetchAround(0, genRef.current);
  }, [prefetchAround]);

  const resetState = useCallback(() => {
    genRef.current += 1;
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    unlockedRef.current = false;
    currentIndexRef.current = 0;
    lastPlayedIndexRef.current = null;
    setCurrentIndex(0);
    setRevealed(false);
    setStatus('idle');
    pendingFetchesRef.current.clear();
    revokeAllUrls();
    releaseWakeLock();
  }, [revokeAllUrls, releaseWakeLock]);

  const open = useCallback(() => {
    setIsOpen(true);
    resetState();
    // パネルを開いた時点で先頭区間（と、その次）の先読みを始めておく。実際の
    // 再生開始はユーザーが「開始」を押した瞬間（gen は resetState 側で既に
    // 確定済みのものをそのまま使うため、ここで始めた先読みと同じキーを共有する）。
    prefetchAround(0, genRef.current);
  }, [resetState, prefetchAround]);

  const close = useCallback(() => {
    setIsOpen(false);
    resetState();
  }, [resetState]);

  const setBoundaryMode = useCallback(
    (next: DictationBoundaryMode) => {
      writeStoredBoundaryMode(next);
      setBoundaryModeState(next);
      // 区切りの形が変わるため、キャッシュしていた音声は対応が取れなくなる。
      // 設計方針: 現在位置に近い区間への復元は行わず、最初から始め直す
      // （区切りの形が変わると旧インデックスとの厳密な対応が付けられないため）。
      resetState();
    },
    [resetState],
  );

  const setRate = useCallback((next: number) => {
    const clamped = clampRate(next);
    writeStoredRate(clamped);
    setRateState(clamped);
    rateRef.current = clamped;
    if (audioRef.current) audioRef.current.playbackRate = clamped;
  }, []);

  // <audio> 要素の生成・破棄。'ended' では次へ進まず、常に止まってユーザー操作を待つ。
  useEffect(() => {
    if (typeof Audio === 'undefined') return;
    const audio = new Audio();
    audio.preload = 'auto';
    audioRef.current = audio;

    const handleEnded = () => {
      const idx = currentIndexRef.current;
      if (idx + 1 >= texts.length) {
        setStatus('finished');
      } else {
        setStatus('stopped');
      }
    };
    const handleError = () => {
      if (!audio.getAttribute('src')) return;
      setStatus('error');
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
  }, [texts.length]);

  // タブ非表示: 再生中の音声を止める（既存の読み上げと同じ扱い）。位置は保持し、
  // 復帰時に同じ区間から続けられるようにする（Wake Lock は解放し、復帰時に再取得する）。
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVisibility = () => {
      if (document.hidden) {
        if (audioRef.current && !audioRef.current.paused) {
          audioRef.current.pause();
          setStatus((s) => (s === 'playing' ? 'stopped' : s));
        }
        releaseWakeLock();
      } else if (isOpen) {
        requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [isOpen, releaseWakeLock, requestWakeLock]);

  // アンマウント時の後始末
  useEffect(() => {
    const pendingFetches = pendingFetchesRef.current;
    return () => {
      genRef.current += 1;
      pendingFetches.clear();
      revokeAllUrls();
      releaseWakeLock();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    isOpen,
    open,
    close,
    mode,
    boundaryMode,
    setBoundaryMode,
    rate,
    setRate,
    status,
    currentIndex,
    total: texts.length,
    /** 表示順の区間一覧（ハイライト用）。パネル自体は currentSegment だけで足りる。 */
    segments: dictationSegments,
    currentSegment: dictationSegments[currentIndex] ?? null,
    /** start/next/previous/restart でだけ増える。もう一度・速度変更では増えない
        （ハイライトの自動スクロールが「切り替わったときだけ動く」判定に使う）。 */
    moveSeq,
    // 将来の「答えを見る」方式のモード（タイプ入力等）向けに残す。今の画面（常時表示）からは参照しない。
    revealed,
    toggleReveal,
    start,
    replay,
    next,
    // 将来「前へ」を復活できるように残す。今の画面からは参照しない。
    previous,
    restartFromBeginning,
    hasNext: currentIndex + 1 < texts.length,
    hasPrevious: currentIndex > 0,
  };
}

export type UsePracticeReadAloudReturn = ReturnType<typeof usePracticeReadAloud>;
