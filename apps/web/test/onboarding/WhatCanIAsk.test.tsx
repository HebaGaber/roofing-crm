// The CRM's first-visit guide (CRM-HANDOFF section 4.10, E-28; boards Welcome1440/768/390): one
// dismissible, non-modal "What can I ask?" card over the map. Three example questions open /ask
// with the question prefilled (never auto-run: an ask costs model money).
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WhatCanIAsk } from "../../src/components/Onboarding/WhatCanIAsk.js";
import {
  ASK_QUESTION_PARAM,
  EXAMPLE_QUESTIONS,
  WHAT_CAN_I_ASK_EVENT,
  WHAT_CAN_I_ASK_STORAGE_KEY,
  askHref,
  openWhatCanIAsk,
} from "../../src/components/Onboarding/firstVisit.js";

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

function renderAt(url = "/"): void {
  render(
    <MemoryRouter initialEntries={[url]}>
      <WhatCanIAsk />
    </MemoryRouter>,
  );
}

describe("example questions", () => {
  it("are the golden queries' prompts, verbatim", () => {
    const golden = JSON.parse(
      readFileSync(resolve(__dirname, "../../../../tests/agent/golden.json"), "utf8"),
    ) as { queries?: { prompt: string }[] } | { prompt: string }[];
    const prompts = (Array.isArray(golden) ? golden : (golden.queries ?? [])).map((q) => q.prompt);
    expect(prompts.length).toBeGreaterThan(0);
    expect(EXAMPLE_QUESTIONS).toHaveLength(3);
    for (const question of EXAMPLE_QUESTIONS) expect(prompts).toContain(question);
  });

  it("each link prefills the Ask box through the exported param and never auto-runs", () => {
    expect(ASK_QUESTION_PARAM).toBe("q");
    const href = askHref(EXAMPLE_QUESTIONS[0] as string);
    expect(href.startsWith("/ask?q=")).toBe(true);
    expect(new URL(href, "http://x").searchParams.get(ASK_QUESTION_PARAM)).toBe(
      EXAMPLE_QUESTIONS[0],
    );
    expect(href).not.toMatch(/run|auto|submit/i);
  });
});

describe("WhatCanIAsk card", () => {
  it("opens on the first visit as a non-modal dialog with an accessible name", () => {
    renderAt();
    const dialog = screen.getByRole("dialog", { name: "What can I ask?" });
    expect(dialog.getAttribute("aria-modal")).not.toBe("true");
    const links = within(dialog).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual([...EXAMPLE_QUESTIONS]);
    expect(links.map((l) => l.getAttribute("href"))).toEqual(
      EXAMPLE_QUESTIONS.map((q) => askHref(q)),
    );
  });

  it("says what the data is and does not claim data that is not published", () => {
    renderAt();
    const text = screen.getByRole("dialog").textContent ?? "";
    expect(text).toMatch(/Travis County/);
    expect(text).toMatch(/roof age/i);
    expect(text).toMatch(/permits/i);
    expect(text).toMatch(/contractors where published/i);
    expect(text).toMatch(/addresses and BBB ratings are not published/i);
    expect(text).toMatch(/every answer shows its sources/i);
  });

  it("moves focus into the card", () => {
    renderAt();
    const dialog = screen.getByRole("dialog");
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("is not shown once dismissed", () => {
    localStorage.setItem(WHAT_CAN_I_ASK_STORAGE_KEY, "dismissed");
    renderAt();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it.each([["Close"], ["Got it"]])("%s dismisses it and remembers that", (name) => {
    renderAt();
    fireEvent.click(screen.getByRole("button", { name }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(localStorage.getItem(WHAT_CAN_I_ASK_STORAGE_KEY)).toBe("dismissed");
  });

  it("closes on Escape", () => {
    renderAt();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(localStorage.getItem(WHAT_CAN_I_ASK_STORAGE_KEY)).toBe("dismissed");
  });

  it("closes on Escape even when focus has left the card (non-modal)", () => {
    renderAt();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("following an example question counts as dismissed", () => {
    renderAt();
    fireEvent.click(screen.getAllByRole("link")[0] as HTMLElement);
    expect(localStorage.getItem(WHAT_CAN_I_ASK_STORAGE_KEY)).toBe("dismissed");
  });

  it("first=1 forces it open for a demo even after it was dismissed", () => {
    localStorage.setItem(WHAT_CAN_I_ASK_STORAGE_KEY, "dismissed");
    renderAt("/?first=1");
    expect(screen.getByRole("dialog", { name: "What can I ask?" })).not.toBeNull();
  });

  it("reopens on the shell Help menu's event and through openWhatCanIAsk()", () => {
    localStorage.setItem(WHAT_CAN_I_ASK_STORAGE_KEY, "dismissed");
    renderAt();
    expect(screen.queryByRole("dialog")).toBeNull();
    act(() => {
      window.dispatchEvent(new CustomEvent(WHAT_CAN_I_ASK_EVENT));
    });
    expect(screen.getByRole("dialog")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    act(() => openWhatCanIAsk());
    expect(screen.getByRole("dialog")).not.toBeNull();
    expect(WHAT_CAN_I_ASK_EVENT).toBe("crm:open-what-can-i-ask");
  });

  it("works without storage: shows, and dismisses for the visit", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    renderAt();
    expect(screen.getByRole("dialog")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
