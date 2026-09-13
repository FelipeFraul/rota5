# Gate credential revocation rollout

This change uses `EXPAND -> DEPLOY -> CONTRACT`. The finding remains active
until CONTRACT and the post-contract runtime checks pass.

## Phase 0: release path proof

Before changing the remote database, create a controlled Vercel deployment from
OLD_APP, the source currently published on GitHub, without automatic promotion
or production aliases. Record its deployment ID and commit, then verify a READY
build, startup, and health endpoint. This phase proves only
`VERCEL_RELEASE_PATH_HEALTHY`; it does not prove HIGH #1. NEW_APP cannot run
against OLD_DB and must not be used for this remote preview. A separate isolated
database equivalent to EXPAND_DB would be the only safe exception. Do not
schedule remote EXPAND while the latest usable proof is an errored deployment.
Git auto-deploy stays disabled throughout rollout.

## Phase 1: expand

Apply `20260912000100_gate_credential_session_revocation_expand.sql` and record
its application timestamp. The nullable source columns and dual-mode RPCs allow
OLD_APP and NEW_APP to coexist. Calls without the new authentication keys use
`legacy_compat`; the presence of either strict authentication key commits the
call to strict mode, so an invalid strict credential cannot fall back.

The credential-status triggers revoke only sessions with explicit foreign-key
attribution. They never infer a relationship for source-less sessions.

## Phase 2: deploy

First create a controlled NEW_APP preview against EXPAND_DB. Validate startup,
gate and kitchen routes, consultation, creation, and strict authorization with
controlled test records. Only after this preview is healthy, deploy NEW_APP to
production. Validate administrative, temporary, fixed, renewal, consultation,
ticket, kitchen, pause, and revoke paths. Record the cutover timestamp and
retain EXPAND until all old instances have drained.

Run `gate_credential_session_revocation_rollout_gates.sql` with the recorded
EXPAND and cutover timestamps. CONTRACT requires all of these gates:

- A: NEW_APP deployment is healthy and its identity is confirmed.
- B: no known OLD_APP instance is serving traffic.
- C: ticket and combo `legacy_compat` calls after cutover remain zero for the
  agreed observation window.
- D: active, unexpired sessions with `source_kind is null` equal zero.
- E: sessions created after NEW_APP cutover have explicit source at 100%.
- F: a strict ticket scan passes and logs `authorization_mode=strict`.
- G: a strict combo redemption passes and logs `authorization_mode=strict`.
- H: temporary credential pause atomically revokes its linked sessions.
- I: fixed credential revoke atomically revokes its linked sessions.

## Phase 3: contract

Only after A-I pass, copy the audited draft
`supabase/rollout/gate_credential_session_revocation_contract.sql` into a newly
timestamped file under `supabase/migrations/`, rerun the packaging, matrix, race,
ACL, and engineering tests against that materialized SQL, then apply that new
migration. The draft revokes any remaining operational source-less session,
classifies source-less history as `legacy_unattributed`, requires an explicit
source, installs source immutability, and removes legacy RPC authorization. No
phone/event heuristic is used. The draft itself must never be applied remotely.

Before EXPAND there is no rollout rollback: production remains OLD_APP/OLD_DB.
After EXPAND and before NEW_APP, OLD_APP remains supported. If NEW_APP preview
fails, do not promote it; OLD_APP continues on EXPAND_DB. If NEW_APP production
fails before CONTRACT, roll back to OLD_APP while retaining EXPAND_DB. After
CONTRACT, OLD_APP rollback is unsupported; roll NEW_APP forward. Emergency
rollback requires deliberately restoring EXPAND compatibility and reopens the
security gap, so it needs separate operational authorization.
