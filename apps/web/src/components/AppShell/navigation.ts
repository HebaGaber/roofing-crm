// The shell's route/nav table. Primary destinations (bottom bar and rail) and the five
// Coming-soon sections with the icon and one line the boards draw (CrmShell1440, CrmBottomNav).
// Labels and section ids come from @crm/shared's ROADMAP_SECTIONS, so `/coming-soon/:section`
// and every `data-roadmap-section` stay in step with the Coming Soon route.
import { ROADMAP_SECTIONS, type RoadmapSection } from "@crm/shared";

export interface Destination {
  readonly to: "/" | "/leads" | "/ask";
  readonly label: string;
  /** Material Symbols Rounded glyph name (Atlas § 6). */
  readonly icon: string;
}

export const DESTINATIONS: readonly Destination[] = [
  { to: "/", label: "Map", icon: "map" },
  { to: "/leads", label: "Leads", icon: "contact_page" },
  // CrmBottomNav / CrmShell1440 draw Ask with the robot glyph (Atlas § 6: `smart_toy` = agent).
  { to: "/ask", label: "Ask", icon: "smart_toy" },
];

const ROADMAP_ICON_AND_LINE: Readonly<Record<RoadmapSection, { icon: string; line: string }>> = {
  campaigns: { icon: "campaign", line: "Plan outreach to groups of leads." },
  estimates: { icon: "request_quote", line: "Price a roof from the lead." },
  jobs: { icon: "construction", line: "Schedule and track roofing work." },
  invoices: { icon: "receipt_long", line: "Bill completed jobs." },
  outreach: { icon: "mail", line: "Email and SMS to owners." },
};

export interface RoadmapNavItem {
  readonly section: RoadmapSection;
  readonly label: string;
  readonly icon: string;
  readonly line: string;
}

export const ROADMAP_NAV: readonly RoadmapNavItem[] = ROADMAP_SECTIONS.map(
  ({ section, label }) => ({ section, label, ...ROADMAP_ICON_AND_LINE[section] }),
);

/** The one county the CRM serves (CountyLens publishes Travis only). */
export const COUNTY_LABEL = "Travis County, TX";
