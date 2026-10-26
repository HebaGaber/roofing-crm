import { describe, expect, it } from "vitest";
import { mainLeadPermit } from "../../src/leads/mainLeadPermit.js";

describe("mainLeadPermit", () => {
  it("picks the open or stalled permit open longest", () => {
    const a = { id: "a", statusClass: "open", openDays: 100 };
    const b = { id: "b", statusClass: "stalled", openDays: 400 };
    const c = { id: "c", statusClass: "closed", openDays: 900 };
    expect(mainLeadPermit([a, c, b])).toBe(b);
  });

  it("ignores closed and unstatused permits, and returns null when none is live", () => {
    expect(mainLeadPermit([{ statusClass: "closed", openDays: 5 }])).toBeNull();
    expect(mainLeadPermit([{ statusClass: null, openDays: 5 }])).toBeNull();
    expect(mainLeadPermit([])).toBeNull();
    expect(mainLeadPermit(undefined)).toBeNull();
  });

  it("ranks a permit with no openDays last and keeps the first of equals", () => {
    const none = { id: "n", statusClass: "open", openDays: null };
    const x = { id: "x", statusClass: "open", openDays: 10 };
    const y = { id: "y", statusClass: "open", openDays: 10 };
    expect(mainLeadPermit([none, x, y])).toBe(x);
    expect(mainLeadPermit([none])).toBe(none);
  });
});
