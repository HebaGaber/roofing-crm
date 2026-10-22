# Run log: B-01 CRM shell

One line per step; user answers quoted word for word.

- A1 Stage 0: A-03 merged into feature/oracle-pipeline (commit 8ae1870, "A-03: merge walking skeleton (G7 PASS)"). A-13 NOT merged (013-explorer-and-pages branch, unmerged, in oracle-property-intelligence-platform-pipeline-travis-tx-u; that worktree is currently on 014-agent-and-mcp with uncommitted A-14 work). Repo clean except pre-existing P8 planning docs. AWS assess profile OK, account 515618610572. Region eu-north-1 confirmed.
- A1 stop: asked user how to proceed given A-13 unmerged. User: "shall it got merged or can we use the a 13 branch ?"
- A1 clarification given: can use the A-13 branch directly (fully committed, not merged). Flagged risk: -u worktree has a different branch checked out with uncommitted A-14 work, so copy-from-oracle.sh's normal approach (copy from working tree) would require a branch switch there.
- A1 decision asked: git-show read-only extraction vs. temporary branch switch in -u worktree. User answered: "git show, read-only extraction (Recommended)".
- A2 G4 pre-check (Haiku subagent): FAIL, 3 FAILs (C-06 testable, C-08 traced, C-10 ready). Wording-only fixes applied directly: NFR-001/NFR-002 traced to ACs with thresholds; prototype links corrected to .dc.html; depends_on cited with A-03 commit 8ae1870 and A-13 branch status.
- A2 value decisions asked (change AC meaning): AC-2 bounds and AC-3 lockout threshold/duration.
  - AC-2 bounds: user answered "Free pan/zoom, county bbox guaranteed (Recommended)".
  - AC-3 lockout: user answered "4th attempt, 5 min cooldown (Recommended)".
  - Both applied to stories/B-01-crm-shell.md AC-2 and AC-3 text.
- A2 G4 checklist ticked G4-1..G4-10; Decision: Ready, 2026-10-23.
- A3 Branch 001-crm-shell created from feature/roofing-crm (speckit-git-feature). /speckit-specify wrote specs/001-crm-shell/spec.md + checklists/requirements.md (16/16 pass, 0 NEEDS CLARIFICATION) and .specify/feature.json.
- A3 /speckit-clarify: no critical ambiguities (both value decisions already settled at G4). Spec unchanged, checklist still 16/16.
