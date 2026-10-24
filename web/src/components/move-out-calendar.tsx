"use client";

import { useState } from "react";

// Month calendar for picking the move-out day. Past days are disabled, and the
// day the 30-day notice is due is marked so the renter sees it right away.

const NOTICE_DAYS = 30;
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const parse = (value: string) => {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const label = (value: string, opts: Intl.DateTimeFormatOptions) =>
  parse(value).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
const minusDays = (value: string, days: number) => {
  const d = parse(value);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
};

export function MoveOutCalendar({ name, defaultValue }: { name: string; defaultValue?: string }) {
  const now = new Date();
  const today = iso(now.getFullYear(), now.getMonth(), now.getDate());
  const [selected, setSelected] = useState(defaultValue ?? "");
  const start = selected ? parse(selected) : now;
  const [view, setView] = useState({
    y: selected ? start.getUTCFullYear() : now.getFullYear(),
    m: selected ? start.getUTCMonth() : now.getMonth(),
  });

  const firstWeekday = new Date(Date.UTC(view.y, view.m, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate();
  const noticeDue = selected ? minusDays(selected, NOTICE_DAYS) : "";
  const canGoBack = view.y > now.getFullYear() || (view.y === now.getFullYear() && view.m > now.getMonth());
  const shift = (delta: number) =>
    setView(({ y, m }) => ({ y: y + Math.floor((m + delta) / 12), m: (((m + delta) % 12) + 12) % 12 }));

  return (
    <div>
      <input type="hidden" name={name} value={selected} />
      <div className="rounded-2xl border border-line bg-paper p-4">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => shift(-1)}
            disabled={!canGoBack}
            aria-label="Previous month"
            className="grid h-9 w-9 place-items-center rounded-lg transition hover:bg-card disabled:opacity-30"
          >
            ‹
          </button>
          <p className="font-semibold" aria-live="polite">
            {new Date(Date.UTC(view.y, view.m, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}
          </p>
          <button
            type="button"
            onClick={() => shift(1)}
            aria-label="Next month"
            className="grid h-9 w-9 place-items-center rounded-lg transition hover:bg-card"
          >
            ›
          </button>
        </div>
        <div className="mt-3 grid grid-cols-7 gap-1 text-center text-xs text-muted">
          {WEEKDAYS.map((d, i) => (
            <span key={i} className="py-1">{d}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1" role="grid">
          {Array.from({ length: firstWeekday }, (_, i) => <span key={`pad-${i}`} />)}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const day = iso(view.y, view.m, i + 1);
            const past = day < today;
            const isSelected = day === selected;
            const isNotice = day === noticeDue;
            return (
              <button
                key={day}
                type="button"
                disabled={past}
                onClick={() => setSelected(day)}
                aria-pressed={isSelected}
                aria-label={label(day, { weekday: "long", month: "long", day: "numeric" })}
                className={`aspect-square rounded-lg text-sm transition ${
                  isSelected
                    ? "tape font-semibold"
                    : isNotice
                      ? "bg-sun/40 font-semibold"
                      : past
                        ? "text-muted/40"
                        : "hover:bg-card"
                } ${day === today && !isSelected ? "ring-1 ring-tape" : ""}`}
              >
                {i + 1}
              </button>
            );
          })}
        </div>
      </div>
      {selected ? (
        <div className="mt-3 space-y-1 text-sm">
          <p>
            Moving out <strong>{label(selected, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</strong>
          </p>
          <p className="flex items-center gap-2 text-muted">
            <span className="inline-block h-3 w-3 rounded-sm bg-sun/60" />
            Give written notice by {label(noticeDue, { month: "short", day: "numeric" })}
            {noticeDue < today && <span className="text-stamp">(already past: check your lease)</span>}
            <span className="text-xs">· {NOTICE_DAYS} days is typical; your lease decides</span>
          </p>
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted">Pick the day you hand back the keys.</p>
      )}
    </div>
  );
}
