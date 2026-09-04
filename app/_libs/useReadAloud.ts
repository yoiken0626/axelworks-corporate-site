'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { resolveLang, type Lang } from './lang';

export type ReadAloudStatus = 'idle' | 'playing' | 'paused';

export const READ_ALOUD_MIN_RATE = 0.75;
export const READ_ALOUD_MAX_RATE = 1.5;

// 女性ボイスらしい名前のヒューリスティック（環境依存のため名前で当たりを付ける）
const FEMALE_VOICE_RE =
  /female|woman|women|girl|nanami|ayumi|haruka|sayaka|mizuki|kyoko|o-ren|siri.*(?:女性|female)|salli|joanna|kendra|kimberly|ivy|samantha|victoria|karen|moira|tessa|fiona|serena|zira|jenny|aria|michelle|susan|linda|heather|catherine|allison|ava|emma|amy|google 日本語|google us english|google uk english female/i;
const MALE_VOICE_RE = /\bmale\b|man\b|otoya|ichiro|david|mark|george|daniel|alex|fred|guy|ryan/i;

// 自然さの体感が良い順に並べた優先ボイス名（name の部分一致・小文字）。先頭ほど優先。
// 日本語はブラウザで自然に出し分かれる:
//  1. 'google 日本語' … Chrome / Chromium 系だけに存在するネットワーク音声
//     （lang=ja-JP, localService=false）。最も滑らか。
//  2. 'sayaka' … それ以外（Safari / Firefox 等）向けのローカル音声
//     Microsoft Sayaka（localService=true）。旧 Haruka より抑揚が自然。
//  3. 以降は環境差のためのフォールバック。
const VOICE_PREFERENCE: Record<'ja' | 'en', string[]> = {
  ja: [
    'google 日本語',
    'google japanese',
    'sayaka',
    'ayumi',
    'nanami',
    'mizuki',
    'kyoko',
    'haruka',
    'o-ren',
  ],
  en: ['zira', 'jenny', 'aria', 'michelle', 'samantha', 'google us english'],
};

// 単語発音1回あたり口を開ける時間 / boundary が無い環境のトグル間隔
const MOUTH_PULSE_MS = 130;
const MOUTH_FALLBACK_MS = 170;
// onstart 後この時間 boundary が来なければトグルにフォールバック
const BOUNDARY_WAIT_MS = 300;
// 発話中なのに boundary 由来のパルスがこの時間途絶えたら、監視側でトグルに切り替える。
// （Chrome は cancel→speak 直後の utterance で onboundary を発火しないことがある＝
//   一時停止→再開後に口パクが固まる問題への保険）
const BOUNDARY_STALE_MS = 1200;

const splitSentences = (text: string): string[] =>
  text
    .split(/(?<=[。．.!?！？\n])/)
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * Web Speech API（window.speechSynthesis）でテキスト配列を順に読み上げるフック。
 * - 女性ボイスを優先（日本語 / 英語は lang に合わせる）
 * - voiceschanged に対応（ボイス取得が遅れる環境向け）
 * - play/pause/stop と速度変更（0.75〜1.5x）
 * - mouthOpen: 発話タイミング（onboundary）に同期。文と文の間の無音では必ず閉じる
 */
export function useReadAloud(segments: string[], lang: Lang) {
  const [status, setStatus] = useState<ReadAloudStatus>('idle');
  const [rate, setRate] = useState(1);
  const [supported, setSupported] = useState(true);
  const [mouthOpen, setMouthOpen] = useState(false);

  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const rateRef = useRef(rate);
  rateRef.current = rate;
  const idxRef = useRef(0);
  // speak をやり直すたびに増やし、古い utterance のコールバックを無効化する
  const genRef = useRef(0);
  // 口パク用タイマー
  const mouthCloseTimerRef = useRef<number | null>(null);
  const fallbackArmRef = useRef<number | null>(null);
  const fallbackIntervalRef = useRef<number | null>(null);
  // 今回の発話(speakFrom)で onboundary が発火したか。speakFrom ごとに false に戻す。
  // ※ セッション永続にすると、一時停止→再開後に boundary が来なくなった時に
  //   フォールバックが無効化されたままになり口パクが固まる。
  const boundarySeenRef = useRef(false);
  // 最後に口を開いた時刻。boundary パルスが途絶えたことの検知に使う。
  const lastPulseRef = useRef(0);

  const wantLang = resolveLang(lang) === 'en' ? 'en' : 'ja';
  const utterLang = wantLang === 'en' ? 'en-US' : 'ja-JP';

  const sentences = useMemo(
    () => segments.flatMap(splitSentences),
    // segments は配列なので中身で依存を判定
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [segments.join('')],
  );

  const clearMouthTimers = useCallback(() => {
    if (mouthCloseTimerRef.current) window.clearTimeout(mouthCloseTimerRef.current);
    if (fallbackArmRef.current) window.clearTimeout(fallbackArmRef.current);
    if (fallbackIntervalRef.current) window.clearInterval(fallbackIntervalRef.current);
    mouthCloseTimerRef.current = null;
    fallbackArmRef.current = null;
    fallbackIntervalRef.current = null;
  }, []);

  const closeMouth = useCallback(() => {
    clearMouthTimers();
    setMouthOpen(false);
  }, [clearMouthTimers]);

  // 単語発音のたびに口を開け、少し経ったら閉じる
  const pulseMouth = useCallback(() => {
    lastPulseRef.current = performance.now();
    setMouthOpen(true);
    if (mouthCloseTimerRef.current) window.clearTimeout(mouthCloseTimerRef.current);
    mouthCloseTimerRef.current = window.setTimeout(() => {
      mouthCloseTimerRef.current = null;
      setMouthOpen(false);
    }, MOUTH_PULSE_MS);
  }, []);

  // boundary が来ない環境／状態向けのトグル型フォールバックを開始する。
  // 実際の発話が止まる・一時停止する・世代が変わると自己終了する。
  const startMouthFallback = useCallback((gen: number) => {
    if (fallbackIntervalRef.current) return;
    fallbackIntervalRef.current = window.setInterval(() => {
      const s = window.speechSynthesis;
      if (gen !== genRef.current || !s.speaking || s.paused) {
        if (fallbackIntervalRef.current) window.clearInterval(fallbackIntervalRef.current);
        fallbackIntervalRef.current = null;
        setMouthOpen(false);
        return;
      }
      lastPulseRef.current = performance.now();
      setMouthOpen((o) => !o);
    }, MOUTH_FALLBACK_MS);
  }, []);

  const pickVoice = useCallback(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const voices = window.speechSynthesis.getVoices();
    const candidates = voices.filter((v) => v.lang.toLowerCase().startsWith(wantLang));
    if (candidates.length === 0) {
      voiceRef.current = null;
      return;
    }
    // (1) 優先リストの名前に部分一致する最初のボイス
    const byPreference = VOICE_PREFERENCE[wantLang]
      .map((name) => candidates.find((v) => v.name.toLowerCase().includes(name)))
      .find(Boolean);
    // (2) なければ女性名ヒューリスティック → (3) 非・男性 → (4) 先頭
    voiceRef.current =
      byPreference ??
      candidates.find((v) => FEMALE_VOICE_RE.test(v.name)) ??
      candidates.find((v) => !MALE_VOICE_RE.test(v.name)) ??
      candidates[0];
  }, [wantLang]);

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setSupported(false);
      return;
    }
    pickVoice();
    const synth = window.speechSynthesis;
    synth.addEventListener('voiceschanged', pickVoice);
    return () => {
      synth.removeEventListener('voiceschanged', pickVoice);
      synth.cancel();
      clearMouthTimers();
      setStatus('idle');
    };
  }, [pickVoice, clearMouthTimers]);

  const speakFrom = useCallback(
    (start: number) => {
      const synth = window.speechSynthesis;
      const gen = (genRef.current += 1);
      synth.cancel();
      closeMouth();
      // この発話について boundary の可否を判定し直す（再開・速度変更のたびに再評価）
      boundarySeenRef.current = false;
      lastPulseRef.current = performance.now();
      idxRef.current = start;
      const lastIdx = sentences.length - 1;

      for (let i = start; i < sentences.length; i += 1) {
        const u = new SpeechSynthesisUtterance(sentences[i]);
        u.lang = utterLang;
        if (voiceRef.current) u.voice = voiceRef.current;
        u.rate = rateRef.current;
        u.pitch = 1.05;

        u.onstart = () => {
          if (gen !== genRef.current) return;
          idxRef.current = i;
          // この文の読み上げ中、boundary が来なければトグルにフォールバック
          if (fallbackArmRef.current) window.clearTimeout(fallbackArmRef.current);
          fallbackArmRef.current = window.setTimeout(() => {
            fallbackArmRef.current = null;
            if (gen !== genRef.current || boundarySeenRef.current) return;
            startMouthFallback(gen);
          }, BOUNDARY_WAIT_MS);
        };

        u.onboundary = () => {
          if (gen !== genRef.current) return;
          boundarySeenRef.current = true;
          if (fallbackArmRef.current) {
            window.clearTimeout(fallbackArmRef.current);
            fallbackArmRef.current = null;
          }
          if (fallbackIntervalRef.current) {
            window.clearInterval(fallbackIntervalRef.current);
            fallbackIntervalRef.current = null;
          }
          pulseMouth();
        };

        u.onend = () => {
          if (gen !== genRef.current) return;
          // 文と文の隙間（無音）は必ず口を閉じる
          closeMouth();
          if (i === lastIdx) setStatus('idle');
        };

        // onend が発火しない失敗経路（synthesis-failed / network / audio-busy 等）。
        // 自前の cancel 由来（interrupted / canceled）は gen チェックで既に弾かれる。
        u.onerror = () => {
          if (gen !== genRef.current) return;
          genRef.current += 1; // 残りキューのコールバックを無効化
          synth.cancel();
          closeMouth();
          idxRef.current = 0;
          setStatus('idle');
        };

        synth.speak(u);
      }
      setStatus(sentences.length > 0 ? 'playing' : 'idle');
    },
    [sentences, utterLang, closeMouth, pulseMouth, startMouthFallback],
  );

  const play = useCallback(() => {
    if (!supported) return;
    // 一時停止からの再開は、その文の先頭から読み直す
    // （Windows Chrome / Safari の pause/resume が不安定なため cancel ベースにしている）
    speakFrom(status === 'paused' ? idxRef.current : 0);
  }, [supported, status, speakFrom]);

  const pause = useCallback(() => {
    if (status !== 'playing') return;
    genRef.current += 1; // 保留中のコールバックを無効化
    window.speechSynthesis.cancel();
    closeMouth();
    setStatus('paused'); // idxRef は現在位置のまま
  }, [status, closeMouth]);

  const stop = useCallback(() => {
    genRef.current += 1;
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    closeMouth();
    idxRef.current = 0;
    setStatus('idle');
  }, [closeMouth]);

  const toggle = useCallback(() => {
    if (status === 'playing') pause();
    else play();
  }, [status, play, pause]);

  const changeRate = useCallback(
    (next: number) => {
      const clamped = Math.min(READ_ALOUD_MAX_RATE, Math.max(READ_ALOUD_MIN_RATE, next));
      setRate(clamped);
      rateRef.current = clamped;
      // 再生中はその文から新しい速度で読み直す。一時停止中は次の再開時に反映される
      if (status === 'playing') {
        speakFrom(idxRef.current);
      }
    },
    [status, speakFrom],
  );

  // Chromium 系は ~15 秒で読み上げが止まる既知の不具合があるため、再生中は定期的に resume する。
  // Firefox / Safari は不具合が無く、pause/resume が逆効果になり得るので対象外。
  useEffect(() => {
    if (status !== 'playing') return;
    if (typeof navigator === 'undefined' || !/Chrome/.test(navigator.userAgent)) return;
    const id = window.setInterval(() => {
      const s = window.speechSynthesis;
      if (!s.speaking) return;
      if (s.paused) {
        // Chrome が勝手に一時停止した場合の復帰
        s.resume();
      } else {
        // 15 秒バグ回避のためのキック
        s.pause();
        s.resume();
      }
    }, 8000);
    return () => window.clearInterval(id);
  }, [status]);

  // 安全装置: onend / onerror が発火しない終了経路（Chrome の長文自動停止、
  // 音声ドライバ都合の中断、拡張機能の干渉 等）に備える。再生中とみなしているのに
  // speechSynthesis が何も発話していない状態を検知し、口とステートを戻す。
  useEffect(() => {
    if (status !== 'playing') return;
    const synth = window.speechSynthesis;
    let silentTicks = 0;
    const id = window.setInterval(() => {
      if (synth.speaking || synth.pending) {
        silentTicks = 0;
        // 発話中なのに boundary 由来のパルスが途絶えている → トグルに切り替える。
        // （一時停止→再開後に Chrome が onboundary を出さなくなるケースの保険）
        if (
          synth.speaking &&
          !synth.paused &&
          !fallbackIntervalRef.current &&
          performance.now() - lastPulseRef.current > BOUNDARY_STALE_MS
        ) {
          startMouthFallback(genRef.current);
        }
        return;
      }
      // 発話が無いのに口が開いていたら即閉じる
      clearMouthTimers();
      setMouthOpen(false);
      silentTicks += 1;
      // ~1 秒継続して無音なら再生状態も解除（文の切れ目の一時的な false を除外）
      if (silentTicks >= 4) {
        genRef.current += 1;
        synth.cancel();
        idxRef.current = 0;
        setStatus('idle');
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [status, clearMouthTimers, startMouthFallback]);

  // ステートが再生中でなければ口は必ず閉じる（あらゆる終了経路の最終保険）
  useEffect(() => {
    if (status !== 'playing' && mouthOpen) {
      clearMouthTimers();
      setMouthOpen(false);
    }
  }, [status, mouthOpen, clearMouthTimers]);

  // タブ非表示・ページ離脱で読み上げを止めて口を閉じる
  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const stopAll = () => {
      genRef.current += 1;
      window.speechSynthesis.cancel();
      clearMouthTimers();
      setMouthOpen(false);
      idxRef.current = 0;
      setStatus('idle');
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
  }, [clearMouthTimers]);

  return {
    status,
    speaking: status === 'playing',
    mouthOpen,
    rate,
    setRate: changeRate,
    toggle,
    stop,
    supported,
  };
}
