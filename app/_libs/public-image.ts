import fs from 'node:fs';
import path from 'node:path';

// public/ 配下のスクリーンショット用画像を、拡張子 .webp を優先し .png にもフォールバックして探す。
// どちらも無ければ null を返す（呼び出し側は、画像の枠ごと表示しない）。
const IMAGE_EXTENSIONS = ['webp', 'png'] as const;

export function resolvePublicImage(dir: string, basename: string): string | null {
  for (const ext of IMAGE_EXTENSIONS) {
    const filename = `${basename}.${ext}`;
    try {
      if (fs.existsSync(path.join(process.cwd(), 'public', dir, filename))) {
        return `/${dir}/${filename}`;
      }
    } catch {
      // ファイルシステムエラー時は「無い」扱いにする
    }
  }
  return null;
}
