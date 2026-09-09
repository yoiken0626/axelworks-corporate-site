'use client';

import HeroSection from '@/app/_components/HeroSection';
import { useReadAloud } from '@/app/_libs/useReadAloud';
import { useReadAloudHighlight } from '@/app/_libs/useReadAloudHighlight';
import { type Lang } from '@/app/_libs/lang';

type Props = {
  lang: Lang;
  /** 読み上げ対象テキスト（表示順）。ページ本文側の [data-read-aloud-body] と対応する */
  segments: string[];
  latestNews: { slug: string; title: string } | null;
};

/**
 * トップページ用の読み上げ配線。HeroQueen の口パクと再生コントロールが同じ音声を
 * 共有するよう useReadAloud はここで 1 つだけ呼び、HeroSection へ渡す。
 * 本文側のハイライト（News/Business/About/Hiring 各セクションの [data-read-aloud-body]）
 * もここで配線する。
 *
 * 記事・ニュース一覧ページの PageReadAloud と異なり、スクロール位置に応じた
 * ドック（画面上部への固定表示切り替え）は行わない。コントロールはヒーロー画像に
 * 重ねたまま、常にページと一緒にスクロールで流れる。
 */
export default function TopReadAloud({ lang, segments, latestNews }: Props) {
  const { status, mouthOpen, rate, setRate, toggle, stop, chunks, chunkSegments, activeChunk, chunkProgress } =
    useReadAloud(segments, lang);

  useReadAloudHighlight({ chunks, chunkSegments, activeChunk, chunkProgress, follow: true });

  return (
    <HeroSection
      lang={lang}
      mouthOpen={mouthOpen}
      latestNews={latestNews}
      status={status}
      rate={rate}
      setRate={setRate}
      toggle={toggle}
      stop={stop}
    />
  );
}
