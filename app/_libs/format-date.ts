import { formatInTimeZone } from 'date-fns-tz';

// utils.ts（cheerio・OGP取得など重い/サーバー専用の処理を含む）から独立させてある。
// Date コンポーネント経由でクライアントバンドルにも取り込まれるため、軽量に保つ。
export const formatDate = (date: string) => {
  return formatInTimeZone(new Date(date), 'Asia/Tokyo', 'yyyy/MM/dd');
};
