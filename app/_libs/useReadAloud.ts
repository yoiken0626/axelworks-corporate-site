'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { resolveLang, type Lang } from './lang';
import { READ_ALOUD_PAUSE_MARK, READ_ALOUD_LIST_MARK } from './read-aloud-marks';

export type ReadAloudStatus = 'idle' | 'playing' | 'paused';

// ============================================================================
// 診断用（iPhone Safari での「繰り返し」不具合の切り分け用・一時的なコード）
// SHOW_DEBUG_CODE を false にすると、この定数を参照している箇所はすべて元の動作
// （診断コードの表示・console.warn 無し）に戻る。修正が済んだら、このブロックと
// 関連コードごと削除する。
// ============================================================================
const SHOW_DEBUG_CODE = true;
// fetchChunk 内で、失敗の種類を呼び出し元（playFrom）へ伝えるためだけの印。
type DebugTaggedError = Error & { debugCode?: string };

export const READ_ALOUD_MIN_RATE = 0.75;
export const READ_ALOUD_MAX_RATE = 1.5;

// 「繰り返し」ボタンで選べる回数と、メニューを開く前（保存が無い場合）の既定値。
export const REPEAT_OPTIONS = [3, 6, 9] as const;
export const DEFAULT_REPEAT_COUNT = 6;

// 音声キャッシュ（urlCacheRef）の合計サイズの上限（バイト）。/api/tts は従量課金のため、
// 繰り返し再生は「1周目で生成した音声をキャッシュし、2周目以降はキャッシュを再生する」
// ことで API 呼び出しを増やさない設計にしている。この上限を超える場合は、超えた分の
// チャンクをキャッシュせず（再生後に破棄）、繰り返し再生自体を無効化する
// （そのチャンクを再度読む2周目以降で API を呼び直すことになってしまうため）。
const CACHE_BYTE_CAP = 30 * 1024 * 1024; // 30MB

// 1チャンクの最大バイト数。Google TTS の実上限（5000バイト）に対して十分小さくし、
// 最初の音が鳴るまでの待ち時間も短くする。日本語で概ね 400〜500 文字。
const CHUNK_BYTES = 1400;

// 口パクのトグル間隔（ms）。再生位置が進んでいる間だけ開閉を繰り返す。
const MOUTH_PULSE_MS = 150;
// currentTime がこの回数連続で進まなければ「音が止まった」とみなして口を閉じる
const STALL_TICKS = 3;

// 見出しチャンクを読み終えてから次のチャンクを再生するまでの間（ms）。
const HEADING_PAUSE_MS = 700;
// リスト項目チャンクを読み終えてから次へ進むまでの間（ms）。見出しより短め。
const LIST_ITEM_PAUSE_MS = 400;
// ハイライトの推定位置を実際の発音より少し先に出すための先読み秒数。
// timeupdate ではなく毎フレーム更新する分と合わせて「遅れて見える」のを解消する。
const HIGHLIGHT_LEAD_SEC = 0.25;

// iOS Safari 対策: fetch を挟むと後続の audio.play() がユーザー操作外とみなされ拒否される。
// 最初の操作時にこの無音を同期再生して <audio> をアンロックしておく。
const SILENT_WAV =
  'data:audio/wav;base64,UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YSADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

const encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
const byteLen = (s: string): number => (encoder ? encoder.encode(s).length : s.length);

export const splitSentences = (text: string): string[] =>
  text
    .split(/(?<=[。．.!?！？\n])/)
    .map((s) => s.trim())
    .filter(Boolean);

// 1 つの読み上げ単位。isHeading / isListItem の直後にはそれぞれの長さの間を置く。
export type ReadAloudChunk = { text: string; isHeading: boolean; isListItem: boolean };

// 文の配列を、CHUNK_BYTES に収まる読み上げ単位へまとめ直す。
// 1文が単独で予算を超える場合は句読点・空白を優先して強制分割する。
// 先頭にマーカーが付いた文（= 見出し / リスト項目）は独立したチャンクにする。
const buildChunks = (sentences: string[]): ReadAloudChunk[] => {
  const chunks: ReadAloudChunk[] = [];
  let current = '';

  const flush = () => {
    const trimmed = current.trim();
    if (trimmed) chunks.push({ text: trimmed, isHeading: false, isListItem: false });
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
      chunks.push({ text: rest.slice(0, at).trim(), isHeading: false, isListItem: false });
      rest = rest.slice(at);
    }
    return rest;
  };

  for (const sentence of sentences) {
    // 見出し（優先）／リスト項目: 前を確定 → 単独チャンクに（マーカーは除去）
    if (sentence.startsWith(READ_ALOUD_PAUSE_MARK)) {
      flush();
      const text = sentence.split(READ_ALOUD_PAUSE_MARK).join('').split(READ_ALOUD_LIST_MARK).join('').trim();
      if (text) chunks.push({ text, isHeading: true, isListItem: false });
      continue;
    }
    if (sentence.startsWith(READ_ALOUD_LIST_MARK)) {
      flush();
      const text = sentence.split(READ_ALOUD_LIST_MARK).join('').split(READ_ALOUD_PAUSE_MARK).join('').trim();
      if (text) chunks.push({ text, isHeading: false, isListItem: true });
      continue;
    }
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
  // いま再生中のチャンク index（idle / 停止時は -1、一時停止中は保持）。
  const [activeChunk, setActiveChunk] = useState(-1);
  // アクティブチャンク内の再生進捗（currentTime / duration, 0〜1）。
  // ハイライト側が「チャンク内のどの文か」を文字数割合から推定するのに使う。
  const [chunkProgress, setChunkProgress] = useState(0);
  // 繰り返し再生中の周回数（1〜repeatTotal）。0 = 繰り返し無効。
  const [repeatLap, setRepeatLap] = useState(0);
  // 今の繰り返しセッションで選ばれた合計回数（メニューで選択、repeatLap > 0 の間だけ意味を持つ）
  const [repeatTotal, setRepeatTotal] = useState(DEFAULT_REPEAT_COUNT);
  // 音声キャッシュが上限に達し、繰り返し再生を提供できなくなったか
  const [cacheCapped, setCacheCapped] = useState(false);
  // /api/tts の取得に失敗した（403/429/502等）ため再生が止まったか。
  // 次に play() を呼ぶ（＝ユーザーが再試行する）まで表示し続ける。
  const [hasError, setHasError] = useState(false);
  // 診断用: hasError の原因を示す短い記号（例 "M-E:http403"）。
  // SHOW_DEBUG_CODE が false の間は常に null のまま。
  const [errorDebugCode, setErrorDebugCode] = useState<string | null>(null);

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
  // urlCacheRef に入れた Blob の合計バイト数（CACHE_BYTE_CAP との比較用）
  const cacheBytesRef = useRef(0);
  // 上限超過のためキャッシュしなかったチャンクの Object URL。再生完了直後に revoke する
  const uncachedUrlsRef = useRef<Map<number, string>>(new Map());
  const cacheCappedRef = useRef(false);

  // 繰り返し再生: true の間、全チャンク再生後に先頭へ戻って次の周へ進む
  const repeatOnRef = useRef(false);
  // 現在の周（1〜repeatTotalRef.current）。repeatLap state と同じ値を同期して持つ
  const repeatLapRef = useRef(0);
  // 今の繰り返しセッションの合計回数。repeatTotal state と同じ値を同期して持つ
  const repeatTotalRef = useRef(DEFAULT_REPEAT_COUNT);

  // 診断用: 今の再生が「普通のボタン」("B") と「繰り返しメニュー」("M") の
  // どちらから始まったか。hasError の診断コードの接頭辞に使う。
  const startSourceRef = useRef<'B' | 'M'>('B');
  // 診断用: hasError の原因コードを記録し、画面表示用の state に反映しつつ
  // console.warn する。SHOW_DEBUG_CODE が false の間は何もしない。
  const setDebugError = useCallback((code: string) => {
    if (!SHOW_DEBUG_CODE) return;
    const tagged = `${startSourceRef.current}-${code}`;
    // eslint-disable-next-line no-console
    console.warn(`[useReadAloud][debug] ${tagged}`);
    setErrorDebugCode(tagged);
  }, []);

  // 読み上げ単位（チャンク）の一覧。segment（タイトル / 本文…）はまたがず、
  // segment ごとに buildChunks する。各チャンクに元 segment の index を持たせて
  // おき、ハイライト側が「本文チャンクだけ」を DOM に対応づけられるようにする。
  const chunkPlan = useMemo(
    () =>
      segments.flatMap((seg, segIndex) =>
        buildChunks(splitSentences(seg)).map((chunk) => ({ ...chunk, segIndex })),
      ),
    // segments は配列なので中身で依存を判定
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [segments.join('')],
  );

  const chunkTexts = useMemo(() => chunkPlan.map((c) => c.text), [chunkPlan]);
  const chunkSegments = useMemo(() => chunkPlan.map((c) => c.segIndex), [chunkPlan]);
  const chunkHeadings = useMemo(() => chunkPlan.map((c) => c.isHeading), [chunkPlan]);
  const chunkListItems = useMemo(() => chunkPlan.map((c) => c.isListItem), [chunkPlan]);
  // handleEnded から見出し / リスト項目フラグを参照するための ref（play() 時に同期）
  const headingsRef = useRef<boolean[]>([]);
  const listItemsRef = useRef<boolean[]>([]);

  const revokeUrls = useCallback(() => {
    urlCacheRef.current.forEach((url) => URL.revokeObjectURL(url));
    urlCacheRef.current.clear();
    uncachedUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    uncachedUrlsRef.current.clear();
    cacheBytesRef.current = 0;
    cacheCappedRef.current = false;
    setCacheCapped(false);
  }, []);

  // 指定チャンクの音声を取得して Object URL を返す（取得済みなら再利用）。
  // 取得した Blob はキャッシュの合計サイズが CACHE_BYTE_CAP を超えない限り
  // urlCacheRef に保持し、2周目以降（繰り返し再生）はここで再利用される
  // （= /api/tts を呼び直さない）。上限を超える場合はキャッシュせず、繰り返し
  // 再生は無効化する（キャッシュしないと2周目にまた API を呼ぶことになるため）。
  const fetchChunk = useCallback(
    async (idx: number, gen: number): Promise<string | null> => {
      const cached = urlCacheRef.current.get(idx);
      if (cached) return cached;

      const text = chunksRef.current[idx];
      if (!text) return null;

      let res: Response;
      try {
        res = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text, lang: wantLang }),
        });
      } catch {
        // 診断用: /api/tts へのリクエスト自体が届かなかった（オフライン等）
        const err: DebugTaggedError = new Error('failed to reach /api/tts');
        err.debugCode = 'E:http-network';
        throw err;
      }
      if (gen !== genRef.current) return null;
      if (!res.ok) {
        // 診断用: /api/tts がエラーステータスを返した
        const err: DebugTaggedError = new Error(`/api/tts responded ${res.status}`);
        err.debugCode = `E:http${res.status}`;
        throw err;
      }

      let blob: Blob;
      let url: string;
      try {
        blob = await res.blob();
        if (gen !== genRef.current) return null;
        url = URL.createObjectURL(blob);
      } catch {
        // 診断用: 受け取った音声データの読み取り / Object URL 化に失敗
        const err: DebugTaggedError = new Error('failed to read tts response body');
        err.debugCode = 'E:decode';
        throw err;
      }

      if (cacheBytesRef.current + blob.size <= CACHE_BYTE_CAP) {
        cacheBytesRef.current += blob.size;
        urlCacheRef.current.set(idx, url);
      } else {
        if (!cacheCappedRef.current) {
          cacheCappedRef.current = true;
          setCacheCapped(true);
        }
        // 繰り返し中なら今の周を最後まで読んだら止まる（このチャンクを
        // キャッシュできない以上、2周目以降で再度 API を呼ぶことになるため）。
        // ボタンの見た目は直ちに「オフ」にする（実際の停止は今の周の終わりで
        // handleEnded 側が行う）。
        if (repeatOnRef.current) {
          repeatOnRef.current = false;
          setRepeatLap(0);
        }
        uncachedUrlsRef.current.set(idx, url);
      }
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
          // 取得失敗で再生が止まる以上、繰り返し中でも継続できない
          // （このまま repeatOn を残すと、ended が二度と来ないのに
          // ボタンだけ「オン」で固まってしまう）。
          repeatOnRef.current = false;
          repeatLapRef.current = 0;
          setRepeatLap(0);
          setHasError(true);
          setDebugError((error as DebugTaggedError)?.debugCode ?? 'E:http-unknown');
          setStatus('idle');
          setMouthOpen(false);
          setActiveChunk(-1);
          setChunkProgress(0);
        }
        return;
      }
      if (gen !== genRef.current || !url) return;

      chunkIdxRef.current = idx;
      audio.src = url;
      audio.playbackRate = rateRef.current;
      try {
        await audio.play();
      } catch (playError) {
        // 別の play() や pause() に割り込まれた（AbortError）。gen チェック側で処理済み。
        // 診断用: gen が今も有効（＝割り込みではなく本当の失敗）なら、原因を画面に出す。
        // SHOW_DEBUG_CODE が false ならここは常に素通りし、元の挙動（無視して return）のまま。
        if (SHOW_DEBUG_CODE && gen === genRef.current) {
          const name = playError instanceof Error ? playError.name : 'unknown';
          setHasError(true);
          setDebugError(`E:play-${name}`);
          setStatus('idle');
          setMouthOpen(false);
          setActiveChunk(-1);
          setChunkProgress(0);
        }
        return;
      }
      if (gen !== genRef.current) return;
      setStatus('playing');
      setActiveChunk(idx);
      setChunkProgress(0);

      // 次チャンクを先読み（失敗しても本再生には影響させない）
      void fetchChunk(idx + 1, gen).catch(() => {});
    },
    [fetchChunk, setDebugError],
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
      const done = chunkIdxRef.current;
      // 今読み終えたチャンクがキャッシュ上限超過で未キャッシュだった場合、
      // その一時 URL はもう不要なので破棄する
      const stray = uncachedUrlsRef.current.get(done);
      if (stray) {
        URL.revokeObjectURL(stray);
        uncachedUrlsRef.current.delete(done);
      }

      const next = done + 1;
      if (next < chunksRef.current.length) {
        const gen = genRef.current;
        const advance = () => {
          if (gen === genRef.current) void playFromRef.current(next, gen);
        };
        // 見出し / リスト項目を読み終えたら少し間を置いてから次へ
        const gap = headingsRef.current[done]
          ? HEADING_PAUSE_MS
          : listItemsRef.current[done]
            ? LIST_ITEM_PAUSE_MS
            : 0;
        if (gap > 0) {
          window.setTimeout(advance, gap);
        } else {
          advance();
        }
      } else if (repeatOnRef.current && repeatLapRef.current < repeatTotalRef.current) {
        // 繰り返し再生: 次の周へ（キャッシュ済みなのでほぼ即時に再生を開始する）
        const gen = genRef.current;
        repeatLapRef.current += 1;
        setRepeatLap(repeatLapRef.current);
        chunkIdxRef.current = 0;
        void playFromRef.current(0, gen);
      } else {
        repeatOnRef.current = false;
        repeatLapRef.current = 0;
        setRepeatLap(0);
        setStatus('idle');
        chunkIdxRef.current = 0;
        setMouthOpen(false);
        setActiveChunk(-1);
        setChunkProgress(0);
      }
    };
    const handleError = () => {
      // src を外して load() したときの空ソースエラーは無視する
      if (!audio.getAttribute('src')) return;
      genRef.current += 1;
      repeatOnRef.current = false;
      repeatLapRef.current = 0;
      setRepeatLap(0);
      setHasError(true);
      setDebugError(`E:media-${audio.error?.code ?? 'unknown'}`);
      setStatus('idle');
      chunkIdxRef.current = 0;
      setMouthOpen(false);
      setActiveChunk(-1);
      setChunkProgress(0);
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
    // setDebugError は参照が変わらない（useCallback([])）ため依存に入れなくても安全。
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      repeatOnRef.current = false;
      repeatLapRef.current = 0;
      setRepeatLap(0);
      setStatus('idle');
      setMouthOpen(false);
      setActiveChunk(-1);
      setChunkProgress(0);
    };
  }, [chunkTexts, wantLang, revokeUrls]);

  // 再生位置の進捗（0〜1）を毎フレーム更新する。timeupdate は発火間隔が粗く
  // ハイライトが遅れて見えるため rAF で読み、さらに HIGHLIGHT_LEAD_SEC ぶん
  // 先を指すようにして「実際の発音より少し早い」体感にする。
  useEffect(() => {
    if (status !== 'playing') return;
    let raf = 0;
    const tick = () => {
      const audio = audioRef.current;
      if (audio && !audio.paused && !audio.ended) {
        const d = audio.duration;
        if (Number.isFinite(d) && d > 0) {
          const next = Math.min(1, (audio.currentTime + HIGHLIGHT_LEAD_SEC) / d);
          // 微小変化では state を更新せず、無駄な再レンダーを避ける
          setChunkProgress((prev) => (Math.abs(prev - next) < 0.001 ? prev : next));
        }
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [status]);

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

    // 新規再生。前回のエラー表示があれば、再試行にあたりいったん消す
    // （失敗すれば playFrom / handleError が再度立てる）。
    setHasError(false);
    setErrorDebugCode(null);
    const gen = (genRef.current += 1);
    chunksRef.current = chunkTexts;
    headingsRef.current = chunkHeadings;
    listItemsRef.current = chunkListItems;
    chunkIdxRef.current = 0;
    if (chunksRef.current.length === 0) return;
    setStatus('playing');
    void playFrom(0, gen);
  }, [status, chunkTexts, chunkHeadings, chunkListItems, playFrom]);

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
    repeatOnRef.current = false;
    repeatLapRef.current = 0;
    setRepeatLap(0);
    setStatus('idle');
    setMouthOpen(false);
    setActiveChunk(-1);
    setChunkProgress(0);
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
      .catch((error) => {
        // 診断用: 無音再生によるアンロック自体が失敗した場合も原因を出す。
        // SHOW_DEBUG_CODE が false ならここは何もせず、元の挙動（無視）のまま。
        if (SHOW_DEBUG_CODE) {
          const name = error instanceof Error ? error.name : 'unknown';
          setHasError(true);
          setDebugError(`E:unlock-${name}`);
        }
      });
  }, [setDebugError]);

  const toggle = useCallback(() => {
    if (status === 'playing') {
      pause();
    } else {
      startSourceRef.current = 'B'; // 診断用: 普通のボタンから始めたことを記録
      unlockAudio();
      play();
    }
  }, [status, play, pause, unlockAudio]);

  // 繰り返し中に「繰り返し」ボタンが押されたとき。メニューは開かず、今の周を
  // 最後まで読んだところで止まる（ループはしない）。
  const stopRepeat = useCallback(() => {
    repeatOnRef.current = false;
    setRepeatLap(0);
  }, []);

  // メニューで回数を選んだとき。いまの周を1周目として数えて合計 count 回読み上げる
  // （停止中に選んだ場合は最初から再生を始める）。
  // iOS Safari 対策: unlockAudio〜play の呼び出しは、呼び出し元（メニュー項目の
  // onClick）から同期的に届く前提。setTimeout 等を挟むとユーザー操作起点と
  // 認められず再生が拒否されるため、ここでは一切遅延を挟まない。
  const startRepeat = useCallback(
    (count: number) => {
      if (cacheCappedRef.current) return; // 上限超過のため無効化中
      startSourceRef.current = 'M'; // 診断用: 繰り返しメニューから始めたことを記録
      repeatOnRef.current = true;
      repeatLapRef.current = 1;
      repeatTotalRef.current = count;
      setRepeatTotal(count);
      setRepeatLap(1);
      if (status === 'idle') {
        unlockAudio();
        play();
      }
      // playing / paused の場合は現在の再生をそのまま続け、今の周を1周目として数える
    },
    [status, play, unlockAudio],
  );

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
      repeatOnRef.current = false;
      repeatLapRef.current = 0;
      setRepeatLap(0);
      setStatus('idle');
      setMouthOpen(false);
      setActiveChunk(-1);
      setChunkProgress(0);
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
    // 繰り返し再生
    repeatLap,
    repeatTotal,
    startRepeat,
    stopRepeat,
    cacheCapped,
    // /api/tts 取得失敗時のエラー表示
    hasError,
    // 診断用（一時的）: エラーの原因を示す短い記号。SHOW_DEBUG_CODE=false なら常に null。
    errorDebugCode,
    // テキストハイライト用
    chunks: chunkTexts,
    chunkSegments,
    activeChunk,
    chunkProgress,
  };
}
