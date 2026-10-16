import { dayEndOf, type Settings } from "./settings.ts";
import { addDays, hhmmToMin, MIN, overlaps, tsToDate, weekdayOf, zonedToTs, type Interval } from "./time.ts";

/** 予約を受け付ける日付の範囲（現地日付） */
export function bookableRange(s: Settings, now: number): { first: string; last: string } {
  const today = tsToDate(now, s.timezone);
  return { first: s.allowSameDay ? today : addDays(today, 1), last: addDays(today, s.horizonDays) };
}

export function slotInterval(s: Settings, date: string, hhmm: string): Interval {
  const start = zonedToTs(date, hhmm, s.timezone);
  return { start, end: start + s.durationMin * MIN };
}

/** 開催方法。対面（office / visit）は移動時間ぶんの余裕を前後に確保する */
export type BufferMode = "online" | "office" | "visit";

/** 前後の余裕時間を含めた占有範囲（対面は移動時間が基本の余裕より長ければそちらを使う） */
export function blockOf(s: Settings, iv: Interval, mode?: BufferMode): Interval {
  const travel = mode === "office" || mode === "visit" ? s.inPersonBufferMin : 0;
  return {
    start: iv.start - Math.max(s.bufferBeforeMin, travel) * MIN,
    end: iv.end + Math.max(s.bufferAfterMin, travel) * MIN,
  };
}

/**
 * 1日分の予約可能な開始時刻(HH:mm)を返す。
 * busy: Googleカレンダー等の埋まっている時間 / holds: 当システムの予約(pending/confirmed)の占有範囲
 * どの開始時刻でも「枠長ぶん連続で空き」が条件。
 */
export function daySlots(s: Settings, date: string, busy: Interval[], holds: Interval[], now: number, mode?: BufferMode): string[] {
  const { first, last } = bookableRange(s, now);
  if (date < first || date > last) return [];
  if (!s.weekdays.includes(weekdayOf(date))) return [];
  const out: string[] = [];
  const from = hhmmToMin(s.dayStart);
  const to = hhmmToMin(dayEndOf(s, weekdayOf(date))); // 曜日ごとの終了時刻（例: 火曜は15時まで）
  const taken = [...busy, ...holds];
  for (let m = from; m + s.durationMin <= to; m += s.stepMin) {
    const hhmm = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    const iv = slotInterval(s, date, hhmm);
    if (iv.start < now + s.cutoffMin * MIN) continue;
    const blk = blockOf(s, iv, mode);
    if (taken.some((t) => overlaps(blk, t))) continue;
    out.push(hhmm);
  }
  return out;
}

export function rangeSlots(
  s: Settings, fromDate: string, toDate: string, busy: Interval[], holds: Interval[], now: number, mode?: BufferMode,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (let d = fromDate, n = 0; d <= toDate && n < 100; d = addDays(d, 1), n++) {
    const slots = daySlots(s, d, busy, holds, now, mode);
    if (slots.length) out[d] = slots;
  }
  return out;
}

/** 指定の日時が現在の設定・空き状況のもとで予約可能か */
export function isSlotAvailable(s: Settings, date: string, hhmm: string, busy: Interval[], holds: Interval[], now: number, mode?: BufferMode): boolean {
  return daySlots(s, date, busy, holds, now, mode).includes(hhmm);
}

/** 範囲取得用のUTC秒レンジ（現地日付の0:00〜翌0:00） */
export function dateRangeToTs(s: Settings, fromDate: string, toDate: string): Interval {
  return { start: zonedToTs(fromDate, "00:00", s.timezone), end: zonedToTs(addDays(toDate, 1), "00:00", s.timezone) };
}
