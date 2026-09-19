import type { MetadataRoute } from 'next';

// PWA / Android「ホーム画面に追加」用のマニフェスト。
// アイコンは public/ 配下の固定URL（favicon-source.png から生成）。
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'AXelWorks',
    short_name: 'AXelWorks',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#002d73',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
