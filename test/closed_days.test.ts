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
