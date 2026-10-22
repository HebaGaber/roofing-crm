# Reuse log

Code and design copied from the Oracle repo (Task A). Data is never copied: the CRM reads it by manifest CID.

| Date (UTC) | Oracle path | CRM path | Oracle commit | Oracle branch |
| --- | --- | --- | --- | --- |
| 2026-10-22T22:54Z | `packages/tsconfig` | `packages/tsconfig` | 72ba7a3 | feature/oracle-pipeline |
| 2026-10-22T22:54Z | `packages/eslint-config` | `packages/eslint-config` | 660f73c | feature/oracle-pipeline |
| 2026-10-22T22:54Z | `packages/shared` | `packages/shared` | 660f73c | feature/oracle-pipeline |
| 2026-10-22T22:54Z | `packages/api-client` | `packages/api-client` | 071eb1b | feature/oracle-pipeline |
| 2026-10-22T22:54Z | `infra` | `infra` | 9191b3c | feature/oracle-pipeline |
| 2026-10-22T22:54Z | `.github/workflows` | `.github/workflows` | 732297d | feature/oracle-pipeline |
| 2026-10-22T22:54Z | `apps/web/src/styles` | `apps/web/src/styles` | 071eb1b | feature/oracle-pipeline |
| 2026-10-22T22:54Z | `apps/web/src/components/AppShell.tsx` | `apps/web/src/components/AppShell.tsx` | 660f73c | feature/oracle-pipeline |
| 2026-10-22T22:54Z | `apps/web/src/components/AppShell.module.css` | `apps/web/src/components/AppShell.module.css` | 071eb1b | feature/oracle-pipeline |
| 2026-10-22T22:54Z | `apps/web/src/components/Icon.tsx` | `apps/web/src/components/Icon.tsx` | 570285d | feature/oracle-pipeline |
| 2026-10-22T22:54Z | `apps/web/src/components/Icon.module.css` | `apps/web/src/components/Icon.module.css` | 570285d | feature/oracle-pipeline |
| 2026-10-22T22:54Z | `apps/web/src/components/EmptyState.tsx` | `apps/web/src/components/EmptyState.tsx` | 570285d | feature/oracle-pipeline |
| 2026-10-22T22:54Z | `apps/web/src/components/EmptyState.module.css` | `apps/web/src/components/EmptyState.module.css` | 570285d | feature/oracle-pipeline |
| 2026-10-22T22:54Z | `apps/web/src/components/ErrorBanner.tsx` | `apps/web/src/components/ErrorBanner.tsx` | 660f73c | feature/oracle-pipeline |
| 2026-10-22T22:54Z | `apps/web/src/components/ErrorBanner.module.css` | `apps/web/src/components/ErrorBanner.module.css` | 570285d | feature/oracle-pipeline |
| 2026-10-22T22:54Z | `apps/web/src/components/Skeleton.tsx` | `apps/web/src/components/Skeleton.tsx` | 570285d | feature/oracle-pipeline |
| 2026-10-22T22:54Z | `apps/web/src/components/Skeleton.module.css` | `apps/web/src/components/Skeleton.module.css` | 570285d | feature/oracle-pipeline |
| 2026-10-22T22:54Z | `apps/web/src/components/StatusPill.tsx` | `apps/web/src/components/StatusPill.tsx` | 570285d | feature/oracle-pipeline |
| 2026-10-22T22:54Z | `apps/web/src/components/StatusPill.module.css` | `apps/web/src/components/StatusPill.module.css` | 570285d | feature/oracle-pipeline |
| 2026-10-22T22:54Z | `tests/e2e/responsive.spec.ts` | `tests/e2e/responsive.spec.ts` | a1fd50a | feature/oracle-pipeline |
| 2026-10-22T22:54Z | `tests/e2e/config-guard.spec.ts` | `tests/e2e/config-guard.spec.ts` | 071eb1b | feature/oracle-pipeline |
| 2026-10-22T22:54Z | `tests/e2e/build-checks.spec.ts` | `tests/e2e/build-checks.spec.ts` | 570285d | feature/oracle-pipeline |

Rename pass (B-01, after the copies above; applies to the copied files only):
- Stacks: CountyLensData→CrmData, CountyLensApi→CrmApi, CountyLensWeb→CrmWeb, CountyLensOps→CrmOps, CountyLensCert→CrmDomain (CrmSync has no Task A source; it is built in its own story). createCountyLensStacks→createCrmStacks; infra/bin/countylens.ts→infra/bin/crm.ts; cdk.json app and countylens:* context keys→crm:*.
- Identifiers and resource names: COUNTYLENS_*→CRM_*, countylens-*→crm-*, /countylens/ SSM prefixes→/crm/, CountyLens metrics namespace→RoofingCrm, @countylens/* scope→@crm/*, APP_TITLE "CountyLens"→"Roofing CRM".
- Kept on purpose (Task A deploy values, need a decision): domain countylens.aldarraj.com, Amplify branch feature/oracle-pipeline, githubRepository HebaGaber/oracle-property-intelligence-platform-pipeline-travis-tx, tag project_name=oracle-travis.
- Removed infra/cdk.out (generated Task A synth output copied in with infra).
| 2026-10-22T22:57Z | `infra/cdk.json` | `infra/cdk.json` | 327c11f | feature/oracle-pipeline |
| 2026-10-22T22:57Z | `infra/bin/countylens.ts` | `infra/bin/app.ts` | 071eb1b | feature/oracle-pipeline |
| 2026-10-22T22:57Z | `git show 013-explorer-and-pages:apps/web/src/components/ComingSoonEntry.tsx` (read-only, unmerged A-13 branch) | `apps/web/src/components/ComingSoonEntry.tsx` | 1ad7123 | 013-explorer-and-pages |
| 2026-10-22T22:57Z | `git show 013-explorer-and-pages:apps/web/src/components/ComingSoonEntry.module.css` (read-only, unmerged A-13 branch) | `apps/web/src/components/ComingSoonEntry.module.css` | 1ad7123 | 013-explorer-and-pages |
| 2026-10-22T22:57Z | `git show 013-explorer-and-pages:apps/web/src/components/ComingSoonSkeleton.tsx` (read-only, unmerged A-13 branch) | `apps/web/src/components/ComingSoonSkeleton.tsx` | 1ad7123 | 013-explorer-and-pages |
| 2026-10-22T22:57Z | `git show 013-explorer-and-pages:apps/web/src/components/ComingSoonSkeleton.module.css` (read-only, unmerged A-13 branch) | `apps/web/src/components/ComingSoonSkeleton.module.css` | 1ad7123 | 013-explorer-and-pages |
| 2026-10-22T22:57Z | `git show 013-explorer-and-pages:apps/web/src/routes/ComingSoon.tsx` (read-only, unmerged A-13 branch) | `apps/web/src/routes/ComingSoon.tsx` | 1ad7123 | 013-explorer-and-pages |
| 2026-10-22T22:57Z | `git show 013-explorer-and-pages:apps/web/src/routes/ComingSoon.module.css` (read-only, unmerged A-13 branch) | `apps/web/src/routes/ComingSoon.module.css` | 1ad7123 | 013-explorer-and-pages |
| 2026-10-22T22:57Z | `git show 013-explorer-and-pages:apps/web/test/coming-soon.test.tsx` (read-only, unmerged A-13 branch) | `apps/web/test/coming-soon.test.tsx` | 1ad7123 | 013-explorer-and-pages |
| 2026-10-22T22:57Z | `git show 013-explorer-and-pages:apps/web/src/content/coming-soon.ts` (read-only, unmerged A-13 branch) | `apps/web/src/content/coming-soon.ts` | 1ad7123 | 013-explorer-and-pages |

T001/T002 correction (after the rows above):
- infra: only infra/bin/app.ts (from infra/bin/countylens.ts, copied with the script's destination argument) and infra/cdk.json remain. Removed everything else the infra folder copy brought in (infra/src/*, infra/test/*, infra/package.json, infra/tsconfig.json, infra/vitest.config.ts). Those are Task A's stack implementations, which the CRM writes fresh in T005/T007/T009/T010/T017. cdk.json app now runs bin/app.ts. bin/app.ts still imports ../src/app.js and ../src/config.js, which do not exist until the stack tasks land.
- packages/config: not copied, because it does not exist in the Oracle repo (checked read-only).
- Coming Soon: copied the 7 files listed in T002 plus apps/web/src/content/coming-soon.ts (an addition: ComingSoon.tsx and the two Coming Soon components import it). Not copied: apps/web/test/coming-soon-entries.test.tsx, not needed for the build.
- Section list (T003): apps/web/src/content/coming-soon.ts rewritten to the CRM's five disabled sections (campaigns, estimates, jobs, invoices, outreach). The route reads that list, and the route file itself has no hardcoded section names.
- Deploy values: githubRepository set to HebaGaber/roofing-crm (the CRM origin remote), githubRef set to feature/roofing-crm. Domain (crm.aldarraj.com) and project tag (project_name=roofing-crm) are not in cdk.json or bin/app.ts; they belong to the stack files written later.
- Imports: apps/web Coming Soon files now import @crm/shared (packages/shared is named @crm/shared).
- .github/workflows/ci.yml: deploy-branch condition and comments feature/oracle-pipeline→feature/roofing-crm. Flagged, not changed: .github/workflows/a01-us-gis-probe.yml (Task A Travis County GIS probe, not CRM scope).
- Deleted .github/workflows/a01-us-gis-probe.yml (Task A Travis County GIS probe; out of CRM scope and conflicts with the no-ingestion rule). Replaces the earlier 'flagged' note above.
- Deleted .github/workflows/a04-gis-capture.yml (Task A GIS capture workflow; out of CRM scope, same reason as a01 above).
