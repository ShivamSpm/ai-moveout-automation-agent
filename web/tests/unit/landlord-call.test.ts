import { describe, expect, it } from "vitest";
import { buildCallScript, mapBlandStatus, parseChecklist, toE164 } from "@/server/domain/landlord-call";

describe("toE164", () => {
  it.each([
    ["(415) 555-0134", "+14155550134"],
    ["415.555.0134", "+14155550134"],
    ["1 415 555 0134", "+14155550134"],
    ["+44 20 7946 0958", "+442079460958"],
  ])("formats %s", (input, output) => expect(toE164(input)).toBe(output));

  it.each(["555-0134", "12345", "+0123456789", ""])("rejects %s", (input) => expect(toE164(input)).toBeNull());
});

describe("buildCallScript", () => {
  const script = buildCallScript({ renterName: "Ana", landlordName: "Dana", address: "100 Example St", moveOutDate: "2026-11-30" });

  it("discloses the AI assistant and transcription in the first sentence", () => {
    expect(script.firstSentence).toMatch(/AI assistant/);
    expect(script.firstSentence).toMatch(/transcribed/);
  });

  it("states the move-out date and forbids agreeing on the tenant's behalf", () => {
    expect(script.task).toContain("Monday, November 30, 2026");
    expect(script.task).toMatch(/Never agree to anything for the tenant/);
  });
});

describe("mapBlandStatus", () => {
  it.each([
    [{ status: "completed", answered_by: "human" }, "completed"],
    [{ status: "completed", answered_by: "voicemail" }, "voicemail"],
    [{ status: "no-answer" }, "no_answer"],
    [{ status: "busy" }, "no_answer"],
    [{ status: "failed" }, "failed"],
    [{ queue_status: "call_error" }, "failed"],
    [{ queue_status: "started" }, "in_progress"],
    [{ completed: true, answered_by: "human" }, "completed"],
  ] as const)("maps %j", (details, expected) => expect(mapBlandStatus(details)).toBe(expected));
});

describe("parseChecklist", () => {
  it("parses fenced JSON, fixes bad lanes and dates, and drops invalid items", () => {
    const reply = '```json\n{"date_confirmed": true, "items": [' +
      '{"title": "Professionally clean the carpets", "detail": "Keep the receipt", "lane": "cleaning", "due_date": null},' +
      '{"title": "Return keys and fobs", "lane": "nonsense", "due_date": "Nov 30"},' +
      '{"detail": "no title"}]}\n```';
    const { dateConfirmed, items } = parseChecklist(reply);
    expect(dateConfirmed).toBe(true);
    expect(items).toEqual([
      { title: "Professionally clean the carpets", detail: "Keep the receipt", lane: "cleaning", due_date: null },
      { title: "Return keys and fobs", detail: null, lane: "landlord", due_date: null },
    ]);
  });

  it("returns nothing for non-JSON replies", () => {
    expect(parseChecklist("The landlord did not answer.")).toEqual({ dateConfirmed: null, items: [] });
  });
});
