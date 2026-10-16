// 共通: DOM生成(textContent のみ使用=XSS対策)・API・カレンダー選択
export const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "text") el.textContent = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
};
export const $ = (s, r = document) => r.querySelector(s);
export const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };

export async function api(path, { method = "GET", body } = {}) {
  const r = await fetch(path, {
    method, credentials: "same-origin",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await r.json(); } catch { /* 空レスポンス */ }
  if (!r.ok) { const e = new Error(data.message || "エラーが発生しました"); e.status = r.status; e.data = data; throw e; }
  return data;
}

const WD = ["日", "月", "火", "水", "木", "金", "土"];
export const OFFICE_NOTE = "烏丸今出川になります。詳しい住所はメールにて送付させていただきます。";
export const MODE_LABEL = { online: "オンライン（Google Meet）", office: "対面（弊社事務所）", visit: "対面（店舗・指定場所）" };
export const fmtDate = (d) => { const [y, m, dd] = d.split("-").map(Number); return `${m}月${dd}日（${WD[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()]}）`; };
export const fmtRange = (b) => `${fmtDate(b.date)} ${b.time}〜${b.endTime}`;
export const ymd = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

const addD = (d, n) => { const [y, m, dd] = d.split("-").map(Number); const t = new Date(Date.UTC(y, m - 1, dd + n)); return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()); };
const mondayOf = (d) => { const [y, m, dd] = d.split("-").map(Number); const wd = new Date(Date.UTC(y, m - 1, dd)).getUTCDay(); return addD(d, -((wd + 6) % 7)); }; // 月曜始まり
const hm = (s) => { const [a, b] = s.split(":").map(Number); return a * 60 + b; };
const fromMin = (n) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;

/**
 * 週間カレンダー（月曜始まり）で日時を選ぶピッカー。縦が時刻、横が月〜日の時間割の形で、予約できる枠だけ押せる。
 * fetchDays(from,to) は {日付: [時刻...]} を返す。durationMin は選択中の表示（終了時刻）に使う
 */
export function createPicker({ firstDate, lastDate, today, fetchDays, onPick, durationMin = 60 }) {
  const root = h("div", { class: "wk-root" });
  const cache = new Map(); // 週の月曜 -> days
  const firstMon = mondayOf(firstDate), lastMon = mondayOf(lastDate);
  let mon = firstMon;
  let sel = null; // { date, time }

  async function week(m) {
    if (!cache.has(m)) cache.set(m, await fetchDays(m, addD(m, 6)));
    return cache.get(m);
  }

  async function render() {
    clear(root).append(h("div", { class: "loading", text: "空き状況を確認中…" }));
    let days;
    try { days = await week(mon); } catch (e) { clear(root).append(h("div", { class: "alert", text: e.message })); return; }
    const dates = Array.from({ length: 7 }, (_, i) => addD(mon, i));
    const all = new Set();
    for (const d of dates) for (const t of days[d] || []) all.add(hm(t));
    const [m1, d1] = mon.split("-").slice(1).map(Number), [m2, d2] = dates[6].split("-").slice(1).map(Number);
    const title = `${mon.slice(0, 4)}年${m1}月${d1}日〜${m1 === m2 ? "" : `${m2}月`}${d2}日`;
    const nav = (dir, label, dis) => h("button", { type: "button", class: "cal-nav", "aria-label": label, disabled: dis, onclick: () => { mon = addD(mon, dir * 7); render(); } }, dir < 0 ? "‹" : "›");

    const grid = h("div", { class: "wk-grid", role: "grid" });
    grid.append(h("div", { class: "wk-corner" }));
    dates.forEach((d, i) => {
      const wd = ["月", "火", "水", "木", "金", "土", "日"][i];
      const out = d < firstDate || d > lastDate;
      grid.append(h("div", { class: `wk-dow${i === 5 ? " sat" : ""}${i === 6 ? " sun" : ""}${d === today ? " today" : ""}${out ? " out" : ""}` },
        h("span", { text: wd }), h("b", { text: String(Number(d.slice(8))) })));
    });
    if (all.size === 0) {
      clear(root).append(
        h("div", { class: "cal-head" }, nav(-1, "前の週", mon <= firstMon), h("b", { text: title }), nav(1, "次の週", mon >= lastMon)),
        h("div", { class: "empty", text: "この週に予約できる枠はありません。前後の週をご確認ください。" }));
      return;
    }
    const rows = [...all].sort((a, b) => a - b);
    // 時刻の行（その週に1つでも空きがある時刻だけ。飛び飛びでも時間割として見えるよう、全時刻を縦に並べる）
    const step = rows.length > 1 ? Math.min(...rows.slice(1).map((v, i) => v - rows[i]).filter((x) => x > 0)) : 15;
    const lo = rows[0], hi = rows[rows.length - 1];
    const label = (m) => step >= 30 || (hi - lo) / step <= 8 || m % 30 === 0; // 行が少ない週は全部、多い週は30分ごとに時刻を表示
    for (let m = lo; m <= hi; m += step) {
      const t = fromMin(m);
      grid.append(h("div", { class: `wk-time${m % 60 === 0 ? " hour" : ""}`, text: label(m) ? t : "" }));
      dates.forEach((d, i) => {
        const ok = (days[d] || []).includes(t);
        const on = sel && sel.date === d && sel.time === t;
        grid.append(ok
          ? h("button", { type: "button", class: `wk-slot ok${on ? " sel" : ""}${m % 60 === 0 ? " hour" : ""}`, "aria-pressed": String(!!on),
              "aria-label": `${fmtDate(d)} ${t}から`, text: on ? "選択中" : "○",
              onclick: () => { sel = { date: d, time: t }; onPick({ date: d, time: t }); render(); } })
          : h("div", { class: `wk-slot${m % 60 === 0 ? " hour" : ""}`, "aria-hidden": "true", text: "" }));
      });
    }
    const end = sel ? fromMin(hm(sel.time) + durationMin) : "";
    clear(root).append(...[
      h("div", { class: "cal-head" }, nav(-1, "前の週", mon <= firstMon), h("b", { text: title }), nav(1, "次の週", mon >= lastMon)),
      h("p", { class: "hint center wk-hint", text: "○ が予約できる時間です（開始時刻）。押して選んでください。" }),
      h("div", { class: "wk-scroll" }, grid),
      sel ? h("div", { class: "wk-picked", text: `選択中：${fmtDate(sel.date)} ${sel.time}〜${end}` }) : null,
    ].filter(Boolean));
  }
  render();
  return {
    el: root,
    refresh: () => { cache.clear(); sel = null; onPick(null); return render(); },
    get value() { return sel; },
  };
}
