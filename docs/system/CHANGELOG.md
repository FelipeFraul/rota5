# Baseline changelog

## BASELINE V1.3.1 — FINDING TAXONOMY CORRECTED

- Corrected derived finding metrics without changing product code or any finding status.
- `ACTIVE` now counts strictly as ACTIVE: 0 P0 and 6 HIGH. `POTENTIAL` is tracked separately: 1 HIGH. `OPEN` is explicit: 7 HIGH.
- `risk.admin-event-multistep-partial-state` remains `POTENTIAL/HIGH`; its static evidence supports a risk hypothesis but not an observed intermediate failure.
- Reconciled the complete lifecycle: `OPEN` and `MITIGATED` are confirmed, operationally open statuses; `ACCEPTED` and `NOT_VALIDATED` are excluded from operational-open and release-blocking metrics by explicit policy.

## BASELINE V1.3.0 — P0-3 RESOLVED

- Resolved `risk.vercel-project-identity-drift` while preserving its historical ID, severity, priority, root cause and evidence.
- Canonical chain: GitHub `FelipeFraul/rota5`, branch `production`, Vercel `rota5` (`prj_dl7tt8fZbw88ZQV0GhklY0akEwbf`).
- Vercel `site` and GitHub `FelipeFraul/ticketeira` are Ticketeira infrastructure and remain only as historical cause evidence.
- Git auto-deployment remains disabled; no deployment was created and HEAD `9302cbd46aec802fef371e9c948e7d558c3dfc2a` is not declared published.
- Source state is the pure base commit with zero functional changes since base; product health remains BROKEN and infrastructure health is DEGRADED.

## BASELINE V1.2.0 — P0-2 RESOLVED

- Resolved `bug.combo-redemption-unreachable-consume` with a minimal guard change in `src/lib/tickets/services/comboRedemptions.ts`.
- `combo.redeem`: QUEBRADA → PARCIAL; `kitchen.combo_redemption`: QUEBRADO → PARCIAL.
- Five focused local behavior tests pass; no remote mutating test was executed.
- Gates: typecheck PASS; lint PASS with 24 preexisting warnings; npm test 207/214 with the same 7 preexisting failures; build PASS with the existing warning.
- Baseline remains FROZEN; source base commit `121b7a8a4870f5933bd0cf0d45f12a8d71132424`; baseline commit SELF_NOT_RECORDED.

## BASELINE V1.1.0 — P0-1 RESOLVED

- Date: 2026-09-12T13:36:12.110Z
- `bug.create-event-invalid-jsx`: RESOLVED with ID/severity/priority history preserved.
- Functional diff: one excess `</div>` removed from `CreateEventModal.tsx`.
- Gates: typecheck PASS; lint PASS with 24 preexisting warnings; npm test unchanged at 203/210; build PASS with the existing NFT/Turbopack warning.
- Flow: `admin.web_event_workspace` changed from QUEBRADO to PARCIAL. Capability statuses did not change.
- No commit, push, deploy or remote change was performed.

## BASELINE V1.0.0 — FROZEN

- Date: 2026-09-12T04:24:28.619Z
- Source commit: `a141c6004421fb8442f95493de3ca4ec4d4c997b` on `production`, equal to `origin/production`.
- Working tree: dirty because baseline artifacts are untracked and `src/lib/tickets/messages.ts` has the preserved preexisting hash `c567c2bca0a3494d96ef6242e59139832a4cf648b3a85f02f84ba9f06c937694`.
- Metrics: 17 domains, 66 modules, 56 entrypoints, 140 capabilities, 34 flows, 44 tables, 43 tests and 44 findings.
- Known broken state: 3 P0, 10 HIGH, 2 broken flows, 7 partial flows; npm test, typecheck and lint fail.
- Unresolved evidence: 10 explicit groups. No commit, push or deploy was performed.
