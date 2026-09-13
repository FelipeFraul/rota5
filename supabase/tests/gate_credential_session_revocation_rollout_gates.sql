-- Record the actual EXPAND application timestamp as :expand_applied_at and the
-- NEW_APP cutover timestamp as :new_app_cutover_at in the controlled runbook.
-- These read-only gates complement deployment/runtime evidence for A, B, F-I.

-- GATE_C: must remain zero throughout the chosen observation window.
select
  count(*) filter (where metadata->>'authorization_mode' = 'legacy_compat') as ticket_legacy_compat_calls,
  (select count(*) from public.combo_redemption_events
    where metadata->>'authorization_mode' = 'legacy_compat'
      and created_at >= :'new_app_cutover_at'::timestamptz) as combo_legacy_compat_calls
from public.ticket_validation_events
where created_at >= :'new_app_cutover_at'::timestamptz;

-- GATE_D and transition-legacy inventory. source_null_unexpired must be zero.
select public.gate_session_source_rollout_status(:'expand_applied_at'::timestamptz);

-- GATE_E: NEW_APP source attribution must be 100% after cutover.
select count(*) as new_app_sessions_without_source
from public.gate_sessions
where created_at >= :'new_app_cutover_at'::timestamptz
  and source_kind is null;

-- GATE_A: healthy NEW_APP deployment ID/status must be recorded externally.
-- GATE_B: platform/runtime evidence must show no OLD_APP instance serving traffic.
-- GATE_F/G: execute successful strict ticket/combo scans and verify their event
-- metadata has authorization_mode=strict.
-- GATE_H/I: execute temporary pause and fixed revoke and verify all linked active
-- sessions become revoked in the same committed operation.
-- CONTRACT is permitted only when A-I all pass. Phase 0 first requires a healthy
-- controlled OLD_APP Vercel deployment; the current latest deployment is ERROR.
