import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const container = process.env.ROTA5_POSTGRES_TEST_CONTAINER ?? "rota5-high1-pg-test";
const database = process.env.ROTA5_POSTGRES_TEST_DATABASE ?? "postgres";
const baseArgs = ["exec", container, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database, "-At", "-c"];

function psql(sql, { allowFailure = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", [...baseArgs, sql], { windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      const result = { code: code ?? -1, stdout: stdout.trim(), stderr: stderr.trim() };
      if (result.code !== 0 && !allowFailure) reject(new Error(result.stderr || result.stdout));
      else resolve(result);
    });
  });
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

await psql(`
insert into public.gate_accesses(id,event_id,session_id,phone,passphrase_hash,status) values
 ('40000000-0000-4000-8000-000000000011','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','5515000000011','hash','active'),
 ('40000000-0000-4000-8000-000000000012','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','5515000000012','hash','active'),
 ('40000000-0000-4000-8000-000000000013','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','5515000000013','hash','active'),
 ('40000000-0000-4000-8000-000000000014','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','5515000000014','hash','active');
insert into public.gate_sessions(id,event_id,session_id,gate_label,validator_phone,token_hash,reader_device_binding_hash,status,expires_at,created_by_admin_phone,source_kind,source_gate_access_id) values
 ('60000000-0000-4000-8000-000000000011','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Portaria','5515000000011','ticket-scan-first',null,'active',now()+interval '1 hour','5515000000000','temporary_gate_access','40000000-0000-4000-8000-000000000011'),
 ('60000000-0000-4000-8000-000000000012','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Portaria','5515000000012','ticket-revoke-first',null,'active',now()+interval '1 hour','5515000000000','temporary_gate_access','40000000-0000-4000-8000-000000000012'),
 ('60000000-0000-4000-8000-000000000013','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Cozinha','5515000000013','combo-scan-first','reader-13','active',now()+interval '1 hour','5515000000000','temporary_gate_access','40000000-0000-4000-8000-000000000013'),
 ('60000000-0000-4000-8000-000000000014','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Cozinha','5515000000014','combo-revoke-first','reader-14','active',now()+interval '1 hour','5515000000000','temporary_gate_access','40000000-0000-4000-8000-000000000014');
insert into public.tickets(id,ticket_code,status,session_id) values
 ('70000000-0000-4000-8000-000000000011','RACE-T-1','issued','20000000-0000-4000-8000-000000000001'),
 ('70000000-0000-4000-8000-000000000012','RACE-T-2','issued','20000000-0000-4000-8000-000000000001');
insert into public.combo_redemptions(id,combo_order_id,event_id,session_id,redemption_code,offer_name,quantity,status,qr_token_hash,raw_metadata) values
 ('80000000-0000-4000-8000-000000000013','81000000-0000-4000-8000-000000000013','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','RACE-C-1','Combo',1,'issued','combo-race-13','{"kitchen_status":"preparing","ready_notified_at":"2026-09-12T10:00:00Z"}'),
 ('80000000-0000-4000-8000-000000000014','81000000-0000-4000-8000-000000000014','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','RACE-C-2','Combo',1,'issued','combo-race-14','{"kitchen_status":"preparing","ready_notified_at":"2026-09-12T10:00:00Z"}');
`);

async function scanFirstTicket() {
  const scan = psql(`begin;
    select id from public.gate_accesses where id='40000000-0000-4000-8000-000000000011' for update;
    select id from public.gate_sessions where id='60000000-0000-4000-8000-000000000011' for update;
    select pg_sleep(1);
    select public.validate_ticket_entry('70000000-0000-4000-8000-000000000011','RACE-T-1','60000000-0000-4000-8000-000000000011','Portaria','test',jsonb_build_object('source','race','gate_session_token_hash','ticket-scan-first'))->>'result';
    commit;`);
  await delay(150);
  const revoke = psql(`select public.pause_gate_access_and_revoke_sessions('40000000-0000-4000-8000-000000000011',null,null);`);
  const [scanResult, revokeResult] = await Promise.all([scan, revoke]);
  assert.match(scanResult.stdout, /allowed/);
  assert.match(revokeResult.stdout, /"paused": true/);
  assert.equal((await psql("select status||','||(select status from public.gate_sessions where id='60000000-0000-4000-8000-000000000011') from public.tickets where id='70000000-0000-4000-8000-000000000011';")).stdout, "used,revoked");
}

async function revokeFirstTicket() {
  const revoke = psql(`begin;
    select id from public.gate_accesses where id='40000000-0000-4000-8000-000000000012' for update;
    select public.pause_gate_access_and_revoke_sessions('40000000-0000-4000-8000-000000000012',null,null);
    select pg_sleep(1); commit;`);
  await delay(150);
  const scan = psql(`select public.validate_ticket_entry('70000000-0000-4000-8000-000000000012','RACE-T-2','60000000-0000-4000-8000-000000000012','Portaria','test',jsonb_build_object('source','race','gate_session_token_hash','ticket-revoke-first'));`, { allowFailure: true });
  const [revokeResult, scanResult] = await Promise.all([revoke, scan]);
  assert.equal(revokeResult.code, 0);
  assert.notEqual(scanResult.code, 0);
  assert.match(scanResult.stderr, /gate_credential_inactive|gate_session_inactive/);
  assert.equal((await psql("select status from public.tickets where id='70000000-0000-4000-8000-000000000012';")).stdout, "issued");
}

function comboCall(suffix, token, reader) {
  return `select public.validate_combo_redemption('80000000-0000-4000-8000-0000000000${suffix}','combo-race-${Number(suffix)}','60000000-0000-4000-8000-0000000000${suffix}','Cozinha','test',null,null,jsonb_build_object('source','race','gate_session_token_hash','${token}','kitchen_device_binding_hash','${reader}'))->>'result';`;
}

async function scanFirstCombo() {
  const scan = psql(`begin;
    select id from public.gate_accesses where id='40000000-0000-4000-8000-000000000013' for update;
    select id from public.gate_sessions where id='60000000-0000-4000-8000-000000000013' for update;
    select pg_sleep(1); ${comboCall("13", "combo-scan-first", "reader-13")} commit;`);
  await delay(150);
  const revoke = psql("select public.pause_gate_access_and_revoke_sessions('40000000-0000-4000-8000-000000000013',null,null);");
  const [scanResult] = await Promise.all([scan, revoke]);
  assert.match(scanResult.stdout, /allowed/);
  assert.equal((await psql("select status||','||(select status from public.gate_sessions where id='60000000-0000-4000-8000-000000000013') from public.combo_redemptions where id='80000000-0000-4000-8000-000000000013';")).stdout, "used,revoked");
}

async function revokeFirstCombo() {
  const revoke = psql(`begin;
    select id from public.gate_accesses where id='40000000-0000-4000-8000-000000000014' for update;
    select public.pause_gate_access_and_revoke_sessions('40000000-0000-4000-8000-000000000014',null,null);
    select pg_sleep(1); commit;`);
  await delay(150);
  const scan = psql(comboCall("14", "combo-revoke-first", "reader-14"), { allowFailure: true });
  const [, scanResult] = await Promise.all([revoke, scan]);
  assert.notEqual(scanResult.code, 0);
  assert.match(scanResult.stderr, /gate_credential_inactive|gate_session_inactive/);
  assert.equal((await psql("select status from public.combo_redemptions where id='80000000-0000-4000-8000-000000000014';")).stdout, "issued");
}

await scanFirstTicket();
await revokeFirstTicket();
await scanFirstCombo();
await revokeFirstCombo();
console.log("PostgreSQL race tests passed: ticket 2/2, combo 2/2");
