/** 0〜9の10個の数字（固定の順番）。「九九」モードの並びとしてもそのまま使う。 */
export const DIGITS_0_TO_9 = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

/**
 * Fisher-Yates で配列をシャッフルした新しい配列を返す（元の配列は変更しない）。
 * サーバー側（初期表示）・クライアント側（「ランダム」ボタンでの再シャッフル）の
 * 両方から呼べるよう、DOMに依存しない純粋関数にしてある。
 */
export function shuffle<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
