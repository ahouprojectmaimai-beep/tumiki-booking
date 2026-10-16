import { describe, expect, it } from "vitest";
import { isClosedDayEvent, wholeDays } from "../src/lib/google.ts";
import { daySlots } from "../src/lib/availability.ts";
import { DEFAULT_SETTINGS, normalizeSettings } from "../src/lib/settings.ts";
import { zonedToTs } from "../src/lib/time.ts";
import { NOW } from "./helpers.ts";

const tz = "Asia/Tokyo";
const kw = ["休み", "休業"];

describe("お休み日（休み・休業日）", () => {
  it("件名にキーワードを含む予定だけが対象（予定なし扱いの終日予定でも対象、取り消し済みは対象外）", () => {
    expect(isClosedDayEvent({ id: "1", summary: "TUMIKI休業日", transparency: "transparent" }, kw)).toBe(true);
    expect(isClosedDayEvent({ id: "2", summary: "お休み" }, kw)).toBe(true);
    expect(isClosedDayEvent({ id: "3", summary: "お客様商談" }, kw)).toBe(false);
    expect(isClosedDayEvent({ id: "4", summary: "休み", status: "cancelled" }, kw)).toBe(false);
    expect(isClosedDayEvent({ id: "5" }, kw)).toBe(false);
  });
  it("時間指定の予定でも、その日は丸一日お休みにする", () => {
    const a = zonedToTs("2026-10-21", "13:00", tz);
    const r = wholeDays({ start: a, end: a + 3600 }, tz);
    expect(r).toEqual({ start: zonedToTs("2026-10-21", "00:00", tz), end: zonedToTs("2026-10-22", "00:00", tz) });
  });
  it("終日予定は終了日（排他的）の前日までを休みにする", () => {
    const r = wholeDays({ start: zonedToTs("2026-10-21", "00:00", tz), end: zonedToTs("2026-10-23", "00:00", tz) }, tz);
    expect(r).toEqual({ start: zonedToTs("2026-10-21", "00:00", tz), end: zonedToTs("2026-10-23", "00:00", tz) });
  });
  it("お休みの日は空きが出ない", () => {
    const closed = wholeDays({ start: zonedToTs("2026-10-21", "00:00", tz), end: zonedToTs("2026-10-22", "00:00", tz) }, tz);
    expect(daySlots(DEFAULT_SETTINGS, "2026-10-21", [closed], [], NOW)).toEqual([]);
    expect(daySlots(DEFAULT_SETTINGS, "2026-10-22", [closed], [], NOW).length).toBeGreaterThan(0);
  });
  it("設定: 既定は「休み」「休業」/ キーワードと対象カレンダーを保存できる", () => {
    expect(DEFAULT_SETTINGS.closedDayKeywords).toEqual(["休み", "休業"]);
    const s = normalizeSettings({ closedDayKeywords: [" 休業日 ", "", "定休"], closedDayCalendarIds: ["a@group.calendar.google.com", "a@group.calendar.google.com"] });
    expect(s.closedDayKeywords).toEqual(["休業日", "定休"]);
    expect(s.closedDayCalendarIds).toEqual(["a@group.calendar.google.com"]);
  });
});

describe("終日予定の扱い", () => {
  it("終日予定かどうかを判定する", async () => {
    const { isAllDay } = await import("../src/lib/google.ts");
    expect(isAllDay({ id: "a", start: { date: "2026-10-21" }, end: { date: "2026-10-22" } })).toBe(true);
    expect(isAllDay({ id: "b", start: { dateTime: "2026-10-21T10:00:00+09:00" }, end: { dateTime: "2026-10-21T11:00:00+09:00" } })).toBe(false);
  });
  it("既定では終日予定を空き判定に使わない", () => {
    expect(DEFAULT_SETTINGS.ignoreAllDayEvents).toBe(true);
    expect(normalizeSettings({ ignoreAllDayEvents: false }).ignoreAllDayEvents).toBe(false);
  });
});

describe("終日予定に時間帯が書いてある場合（送り迎えなど）", () => {
  it("「【bibu】16時〜17時30分」は 15:00〜17:30 を埋める（開始の60分前から）", async () => {
    const { allDayTimeRange } = await import("../src/lib/google.ts");
    const e = { id: "x", summary: "【bibu】16時〜17時30分", start: { date: "2026-10-20" }, end: { date: "2026-10-21" } };
    expect(allDayTimeRange(e, tz, 60)).toEqual({ start: zonedToTs("2026-10-20", "15:00", tz), end: zonedToTs("2026-10-20", "17:30", tz) });
  });
  it("時間帯の終わりがない/時間がない終日予定は対象外", async () => {
    const { allDayTimeRange } = await import("../src/lib/google.ts");
    const ev = (summary: string) => ({ id: "y", summary, start: { date: "2026-10-20" }, end: { date: "2026-10-21" } });
    expect(allDayTimeRange(ev("水泳(16時45分〜)"), tz, 60)).toBeNull();
    expect(allDayTimeRange(ev("勤怠連絡"), tz, 60)).toBeNull();
    expect(allDayTimeRange({ id: "z", summary: "16:00-17:00", start: { dateTime: "2026-10-20T16:00:00+09:00" }, end: { dateTime: "2026-10-20T17:00:00+09:00" } }, tz, 60)).toBeNull();
  });
  it("その日は15時までに終わる予約だけ可能（60分枠は14:00開始まで）", async () => {
    const { allDayTimeRange } = await import("../src/lib/google.ts");
    const t = allDayTimeRange({ id: "x", summary: "【bibu】16時〜17時30分", start: { date: "2026-10-21" }, end: { date: "2026-10-22" } }, tz, 60)!;
    const slots = daySlots(DEFAULT_SETTINGS, "2026-10-21", [t], [], NOW);
    expect(slots).toContain("14:00");
    expect(slots).not.toContain("14:15");
    expect(slots).not.toContain("17:00");
  });
});
