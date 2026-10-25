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

// CrmComingSoon390/768/1440: a centred card with the section's purpose, "planned but not part of
// this release", a provenance line and a filled Back to Map button; no skeleton (the boards draw
// none). The purpose lines are the nav tooltips of design/docs/CRM-HANDOFF.md "Coming-soon items".
const PURPOSE: Record<string, string> = {
  campaigns: "Plan outreach to groups of leads.",
  estimates: "Price a roof from the lead.",
  jobs: "Schedule and track roofing work.",
  invoices: "Bill completed jobs.",
  outreach: "Email and SMS to owners.",
};

const routeCss = (): string =>
  readFileSync(join(__dirname, "../src/routes/ComingSoon.module.css"), "utf8");

describe("ComingSoon route (T029, AC-5; CrmComingSoon390/768/1440)", () => {
  for (const item of COMING_SOON_ITEMS.filter((i) => i.linked)) {
    it(`${item.id}: "${item.title} is coming soon" card, planned-not-in-release body, provenance, filled Back to Map`, async () => {
      const page = await renderSection(item.id);
      expect(page.getAttribute("data-route")).toBe("coming-soon");
      expect(page.getAttribute("data-state")).toBe("ready");
      const card = page.querySelector("[data-coming-soon-item]");
      expect(card?.getAttribute("data-coming-soon-item")).toBe(item.id);
      expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(
        `${item.title} is coming soon`,
      );
      expect(
        screen.getByText(
          `${PURPOSE[item.id]} It is planned for the Roofing CRM but not part of this release, so there is nothing to open yet.`,
        ),
      ).toBeTruthy();
      expect(screen.getByText("Roofing CRM · Map, Filters and AI search, plus leads")).toBeTruthy();
      expect(page.querySelector("[data-skeleton]")).toBeNull();
      const backLink = screen.getByRole("link", { name: "Back to Map" });
      expect(backLink.getAttribute("href")).toBe("/");
      expect(backLink.getAttribute("data-variant")).toBe("filled");
    });
  }

  it("an unknown section says there is no section here, with a Back to Map link, never a 404 (AC-5)", async () => {
    const page = await renderSection("nope");
    expect(page.getAttribute("data-state")).toBe("not-found");
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("There’s no section here");
    expect(
      screen.getByText(
        "This link doesn’t match a CRM section. The live sections are Map and Leads.",
      ),
    ).toBeTruthy();
    const backLink = screen.getByRole("link", { name: "Back to Map" });
    expect(backLink.getAttribute("href")).toBe("/");
    expect(backLink.getAttribute("data-variant")).toBe("filled");
  });

  it("the card is centred and Back to Map is a filled primary button (Atlas tokens only)", () => {
    const source = routeCss();
    expect(source).toMatch(/place-items: center/);
    expect(source).toMatch(/background: var\(--md-sys-color-primary\)/);
    expect(source).toMatch(/color: var\(--md-sys-color-on-primary\)/);
    expect(source).toMatch(/--md-sys-shape-corner-full/);
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
