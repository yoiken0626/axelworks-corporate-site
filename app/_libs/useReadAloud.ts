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
  // このブラウザで onboundary が発火するか（一度確認できたら以後フォールバック不要）
  const boundarySeenRef = useRef(false);

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
    setMouthOpen(true);
    if (mouthCloseTimerRef.current) window.clearTimeout(mouthCloseTimerRef.current);
    mouthCloseTimerRef.current = window.setTimeout(() => {
      mouthCloseTimerRef.current = null;
      setMouthOpen(false);
    }, MOUTH_PULSE_MS);
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
            if (fallbackIntervalRef.current) window.clearInterval(fallbackIntervalRef.current);
            fallbackIntervalRef.current = window.setInterval(
              () => setMouthOpen((o) => !o),
              MOUTH_FALLBACK_MS,
            );
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

        synth.speak(u);
      }
      setStatus(sentences.length > 0 ? 'playing' : 'idle');
    },
    [sentences, utterLang, closeMouth, pulseMouth],
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
      if (s.speaking && !s.paused) {
        s.pause();
        s.resume();
      }
    }, 9000);
    return () => window.clearInterval(id);
  }, [status]);

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
