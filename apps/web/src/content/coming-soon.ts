// Coming soon items for the CRM's disabled sections (T003, plan § Coming soon): exactly
// campaigns, estimates, jobs, invoices and outreach. Each has an id (the `/soon/:item` route),
// a title and one sentence. Static text only: no number, row or record, and nothing that looks
// like data. `linked: false` items are listed but have no page. `skeleton` names the
// ComingSoonSkeleton layout drawn for the page.
export type ComingSoonSkeletonLayout = "list" | "map" | "chart" | "form";

export interface ComingSoonItem {
  readonly id: string;
  readonly title: string;
  readonly sentence: string;
  readonly linked: boolean;
  readonly skeleton: ComingSoonSkeletonLayout;
}

export const COMING_SOON_ITEMS: readonly ComingSoonItem[] = Object.freeze([
  {
    id: "campaigns",
    title: "Campaigns",
    sentence: "Running outreach campaigns to a set of leads is not available yet.",
    linked: true,
    skeleton: "list",
  },
  {
    id: "estimates",
    title: "Estimates",
    sentence: "Preparing a roofing estimate for a property is not available yet.",
    linked: true,
    skeleton: "form",
  },
  {
    id: "jobs",
    title: "Jobs",
    sentence: "Tracking roofing jobs from scheduling to completion is not available yet.",
    linked: true,
    skeleton: "list",
  },
  {
    id: "invoices",
    title: "Invoices",
    sentence: "Billing customers for completed work is not available yet.",
    linked: true,
    skeleton: "list",
  },
  {
    id: "outreach",
    title: "Outreach",
    sentence: "Contacting leads by message from the CRM is not available yet.",
    linked: true,
    skeleton: "list",
  },
]);

export function comingSoonItem(id: string): ComingSoonItem | undefined {
  return COMING_SOON_ITEMS.find((item) => item.id === id);
}
