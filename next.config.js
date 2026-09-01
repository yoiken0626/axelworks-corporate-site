/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // public/flags/*.svg（circle-flags 由来の自前の静的アセット）を next/image で扱うために許可する。
    // 第三者のアップロード画像ではないため安全。念のため添付ダウンロード扱い + スクリプト無効化の CSP を付与。
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.microcms-assets.io',
      },
    ],
  },
};

module.exports = nextConfig;
