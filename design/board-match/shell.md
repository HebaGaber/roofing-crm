# Board match: shell, sign-in and Coming soon (added to group leads)

Date: 2026-10-25, from commit 6d0c9e8. Findings come from the shell review (scratchpad review-shell, board left, live right). Fixed in `apps/web/src/components/AppShell/**`, `AppShell.tsx`, `AppShell.module.css`, `routes/SignIn/**`; every change has a unit test, plus width checks in `tests/e2e/responsive/layout.spec.ts`.

## Fixes, in the order asked

1. 768 top bar: the compact breakpoint is now 840 px. Below it the county label is hidden and the data chip shows a short run label (`shortRunLabel`: a short id as Run 3, a dated id as its date, a long id by its tail); the full run is in the chip's name and tooltip and in the panel. Apps stays from 600 px.
2. Data chip ready icon is drawn in `--status-success` (error in the error colour), in the chip and the panel.
3. Rail: the open `/coming-soon/:section` item has `aria-current=page`, `data-active`, and a filled icon pill (sheet row: filled).
4. Account menu: initials avatar, name (an id-like username is replaced by the email), group pill capitalised and inline with the name.
5. Sign-in loading: spinner icon in the button and a polite status line Signing in….
6. More sheet at 390: the More tab no longer takes the active pill while open; role beside Sign out; a What can I ask? row.
7. Polish: bar title 24 px from the edge from 600 px, Apps rows body-medium, sign-in card top-aligned from 600 px, 1 px bar edge below 600 px.

## PO decisions applied

- Rail stays flat (Map, Leads, Ask). Deliberate deviation from the boards, which nest Filters and AI under Map; Ask is its own /ask page (review-log row 42). Logged as review-log row 71.
- Sign-in error wording is the board's. Changed in `apps/web/src/auth/signIn.ts`, the unit tests that assert the classified text, `tests/e2e/B-01.spec.ts`, and the B-01 test plan and reports. Cognito's own raw message, which the tests feed in as input, is untouched; the lockout text is unchanged.
- Help: new `AppShell/HelpMenu.tsx` (icon button and a menu with one item, What can I ask?), mounted in `ShellTopBar`, also a row in the More sheet. On the map it calls `openWhatCanIAsk()` from `components/Onboarding/firstVisit.ts`; on any other route it navigates to `WHAT_CAN_I_ASK_PATH` (`/?first=1`).

## Boards

| Board | Route + state | Status | Notes |
| --- | --- | --- | --- |
| CrmShell1440 / CrmShellApps1440 | top bar 1440, Apps menu | Deviation: rail is flat (Map, Leads, Ask), not nested (PO decision 2026-10-25); no search box in the bar (the Map owns it) | Title now 24 px from the edge; Apps rows are body-medium; Help icon added (PO). |
| CrmShellApps768 | top bar 768, Apps menu open | Matched, data differs | County label dropped below 840 px; the data chip reads Run {n} (full run in the tooltip and panel). The search box is on the Map screen only. |
| CrmShellData1440 / CrmDataChip | data chip and panel | Matched | Ready glyph is now in the success token, error in the error colour; short label below 840 px. |
| CrmAccount | account menu | Matched | Initials avatar in a primary-container circle, name (the email when the username is only an id), group pill capitalised on the name row, Sign out. |
| CrmAppsMenu | Apps menu | Matched | Rows body-medium; CountyLens, Roofing CRM (current), Landing page. |
| CrmShell390 / Shell390More / CrmBottomNav | bottom bar and More sheet 390 | Matched | Opening More does not move the active pill off the page's own tab (Map on the map). Sign out shows who and the role (Admin). Help row What can I ask? added. 1 px edge under the bar. |
| Shell390ComingSoon / CrmComingSoon390/768/1440 | `/coming-soon/:section` | Matched | The open section is the current page: `aria-current=page` and a filled icon pill in the rail, a filled row in the More sheet. |
| CrmSignInLoading390 | signing in | Matched | Progress icon in the disabled button and a polite Signing in… status line (empty until sign-in starts). |
| CrmSignInError390 | wrong email or password | Matched | Text is the board's: Wrong email or password. Check the test login you were sent. (PO decision). Lockout text unchanged. |
| CrmSignIn390/768/1440, Locked, Expired, SignedOut | sign-in states | Matched | Unchanged here; the card is top-aligned from 600 px (was vertically centred). |

Boards whose rows say Matched but were not re-captured in this pass (sign-in Locked, Expired, SignedOut and the three sign-in widths) are covered by the earlier pass and unit tests; the changes here do not touch them beyond the card position.
