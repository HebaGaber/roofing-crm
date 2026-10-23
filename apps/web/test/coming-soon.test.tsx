// T029 (B-01): adapted from A-13 T041 for the CRM's own 5 roadmap sections and the
// /coming-soon/:section route (AC-5). ComingSoonSkeleton assertions are unchanged (generic,
// Task-A-independent); the route tests are rewritten for campaigns/estimates/jobs/invoices/
// outreach and a "Back to Map" action instead of Task A's county-explore logic.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { ComingSoonSkeleton } from "../src/components/ComingSoonSkeleton";
import { COMING_SOON_ITEMS } from "../src/content/coming-soon";

const skeletonCss = (): string =>
  readFileSync(join(__dirname, "../src/components/ComingSoonSkeleton.module.css"), "utf8");

afterEach(cleanup);

async function renderSection(section: string): Promise<HTMLElement> {
  const { Component } = await import("../src/routes/ComingSoon");
  render(
    <MemoryRouter initialEntries={[`/coming-soon/${section}`]}>
      <Routes>
        <Route path="/coming-soon/:section" element={<Component />} />
      </Routes>
    </MemoryRouter>,
  );
  return screen.getByRole("region");
}

describe("ComingSoonSkeleton", () => {
  for (const layout of ["list", "map", "chart", "form"] as const) {
    it(`${layout}: aria-hidden, no text node, no table or row, no progress or busy state`, () => {
      const { container } = render(<ComingSoonSkeleton layout={layout} />);
      const root = container.firstElementChild as HTMLElement;
      expect(root.getAttribute("aria-hidden")).toBe("true");
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      expect(walker.nextNode()).toBeNull();
      expect(
        root.querySelector("table, [role=row], [role=progressbar], [aria-busy], ul, ol"),
      ).toBeNull();
      expect(root.querySelectorAll("div, span").length).toBeGreaterThan(0);
    });
  }

  it("styles are static: no animation, transition or keyframes; blocks use surface-container-highest", () => {
    expect(skeletonCss()).not.toMatch(/animation|transition|@keyframes/);
    expect(skeletonCss()).toMatch(/--md-sys-color-surface-container-highest/);
    expect(skeletonCss()).toMatch(/height:/);
  });
});

describe("ComingSoon route (T029, AC-5)", () => {
  for (const item of COMING_SOON_ITEMS.filter((i) => i.linked)) {
    it(`${item.id}: heading, label, exactly one sentence, a skeleton, and a Back to Map link`, async () => {
      const page = await renderSection(item.id);
      expect(page.getAttribute("data-route")).toBe("coming-soon");
      expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(item.title);
      expect(screen.getByText("Coming soon")).toBeTruthy();
      expect(screen.getByText(item.sentence)).toBeTruthy();
      const skeleton = page.querySelector("[aria-hidden=true][data-skeleton]");
      expect(skeleton).not.toBeNull();
      expect(skeleton?.textContent).toBe("");
      const backLink = screen.getByRole("link", { name: "Back to Map" });
      expect(backLink.getAttribute("href")).toBe("/");
    });
  }

  it("an unknown section is not found, with a Back to Map link, never a 404 (AC-5)", async () => {
    const page = await renderSection("nope");
    expect(page.getAttribute("data-state")).toBe("not-found");
    const backLink = screen.getByRole("link", { name: "Back to Map" });
    expect(backLink.getAttribute("href")).toBe("/");
  });
});
