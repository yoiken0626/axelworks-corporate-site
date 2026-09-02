// 商談予約フォームの候補日時（横軸=営業日、縦軸=時間枠）を組み立てるヘルパー。

export type AppointmentDay = {
  /** 一意キー。例: "2026-09-02" */
  key: string;
  /** 見出し表示用。例: "9/2(水)" */
  label: string;
  /** メール本文用。例: "2026/09/02(水)" */
  full: string;
};

export const APPOINTMENT_TIMES = ['9:00', '13:00', '16:00'] as const;
export const MAX_SELECTIONS = 3;

const WEEKDAY: Record<'ja' | 'en', string[]> = {
  ja: ['日', '月', '火', '水', '木', '金', '土'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
};

const isBusinessDay = (d: Date) => {
  const day = d.getDay();
  return day !== 0 && day !== 6; // 日曜(0)・土曜(6)を除外
};

// サーバー(UTC)とクライアント(JST)で「今日」の判定がずれないよう、
// 東京時刻の年月日から Date を組み立てる。
const todayInTokyo = (): Date => {
  const iso = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const pad = (n: number) => String(n).padStart(2, '0');

/** 直近の営業日から count 営業日分（土日を除く）を返す。曜日表記は lang に合わせる */
export const getAppointmentDays = (
  count = 3,
  lang: string = 'ja',
  base?: Date,
): AppointmentDay[] => {
  const weekday = lang === 'en' ? WEEKDAY.en : WEEKDAY.ja;
  const cursor = base ? new Date(base) : todayInTokyo();
  cursor.setHours(0, 0, 0, 0);
  const days: AppointmentDay[] = [];
  while (days.length < count) {
    if (isBusinessDay(cursor)) {
      const y = cursor.getFullYear();
      const m = cursor.getMonth() + 1;
      const d = cursor.getDate();
      const w = weekday[cursor.getDay()];
      days.push({
        key: `${y}-${pad(m)}-${pad(d)}`,
        label: `${m}/${d}(${w})`,
        full: `${y}/${pad(m)}/${pad(d)}(${w})`,
      });
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
};

/** チェックボックス1マスの一意キー */
export const slotId = (dayKey: string, time: string) => `${dayKey}_${time}`;

// 予約受付のリードタイム。この時間を切った候補日時は選択不可にする。
export const LEAD_TIME_MS = 2 * 60 * 60 * 1000;

/** その候補日時（JST）の絶対時刻。JST は年間を通じて +09:00 固定 */
export const slotDateTime = (dayKey: string, time: string): Date => {
  const [h, m = '00'] = time.split(':');
  return new Date(`${dayKey}T${h.padStart(2, '0')}:${m.padStart(2, '0')}:00+09:00`);
};

/** 現在時刻から見て、その候補日時まで LEAD_TIME_MS を切っている（または過ぎている）か */
export const isSlotTooSoon = (dayKey: string, time: string, now: number): boolean => {
  return slotDateTime(dayKey, time).getTime() - now < LEAD_TIME_MS;
};
