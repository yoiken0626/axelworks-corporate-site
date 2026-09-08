/**
 * 読み上げテキストに埋め込む不可視マーカー（私用領域）。
 *
 * `htmlToPlainText` が見出し（H1〜H6）／リスト項目（LI）テキストの直前に差し込み、
 * `useReadAloud` の `buildChunks` がこれを検出して「独立した読み上げ単位にし、直後に
 * 間を置く」ために使う。通常の本文テキストには現れない文字なので誤検出しない。
 *
 * 依存なしのモジュールに置くことで、サーバー側（utils.ts）とクライアント側
 * （useReadAloud.ts / useReadAloudHighlight.ts）の両方から安全に import できる。
 */

/** 見出し（H1〜H6）の直前に付くマーカー。直後に長め（HEADING_PAUSE_MS）の間。 */
export const READ_ALOUD_PAUSE_MARK = '\uE000';

/** リスト項目（LI）の直前に付くマーカー。直後に短め（LIST_ITEM_PAUSE_MS）の間。 */
export const READ_ALOUD_LIST_MARK = '\uE001';

const MARKS_RE = /[\uE000\uE001]/g;

/** 読み上げマーカーをすべて取り除く。 */
export const stripReadAloudMarks = (text: string): string => text.replace(MARKS_RE, '');
