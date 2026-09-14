import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { loadProductionModule, MemorySupabase } from "./test-support/production-module-harness.mjs";

function normalizePhone(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits && !digits.startsWith("55") ? `55${digits}` : digits || null;
}

async function loadService(db) {
  return loadProductionModule("src/lib/tickets/services/fixedGateAccesses.ts", {
    getSupabaseAdmin: () => db,
    buildWhatsAppPhoneCandidates: (phone) => [normalizePhone(phone)],
    hashGateAccessPassphrase: (value) => createHash("sha256").update(value).digest("hex"),
    verifyGateAccessPassphrase: (value, hash) => createHash("sha256").update(value).digest("hex") === hash,
    createGateSession: async () => ({ ok: true, gateSession: { id: "session" } }),
    normalizeGatePhone: normalizePhone,
  });
}

test("gate.fixed_create and gate.fixed_list persist a hashed credential only for its owner", async () => {
  const db = new MemorySupabase({ fixed_gate_accesses: [] });
  const service = await loadService(db);
  const created = await service.createFixedGateAccess({
    phone: "(15) 99999-0000",
    passphrase: " segredo ",
    ownerAdminUserId: "admin-a",
    createdByAdminPhone: "15911110000",
  });

  assert.equal(created.ok, true);
  assert.equal(db.tables.fixed_gate_accesses[0].phone, "5515999990000");
  assert.notEqual(db.tables.fixed_gate_accesses[0].passphrase_hash, "segredo");
  assert.equal(db.tables.fixed_gate_accesses[0].owner_admin_user_id, "admin-a");

  const ownerList = await service.listFixedGateAccesses("admin-a");
  const otherList = await service.listFixedGateAccesses("admin-b");
  assert.deepEqual(ownerList.accesses.map((access) => access.id), [created.access.id]);
  assert.deepEqual(otherList.accesses, []);
  assert.equal("passphrase_hash" in ownerList.accesses[0], false);
});

test("gate.fixed_revoke preserves owner authorization and revokes linked sessions once", async () => {
  const db = new MemorySupabase(
    {
      fixed_gate_accesses: [{ id: "access-a", owner_admin_user_id: "admin-a", status: "active" }],
      gate_sessions: [
        { id: "session-a", source_fixed_gate_access_id: "access-a", status: "active" },
        { id: "session-other", source_fixed_gate_access_id: "other", status: "active" },
      ],
    },
    {
      revoke_fixed_gate_access_and_revoke_sessions: async (args, store) => {
        const access = store.tables.fixed_gate_accesses.find(
          (row) => row.id === args.p_access_id && row.owner_admin_user_id === args.p_owner_admin_user_id,
        );
        if (!access || access.status !== "active") return { data: { revoked: false }, error: null };
        access.status = "revoked";
        for (const session of store.tables.gate_sessions) {
          if (session.source_fixed_gate_access_id === access.id && session.status === "active") session.status = "revoked";
        }
        return { data: { revoked: true }, error: null };
      },
    },
  );
  const service = await loadService(db);

  assert.deepEqual(
    await service.revokeFixedGateAccess({ accessId: "access-a", ownerAdminUserId: "admin-b", revokedByAdminUserId: "admin-b" }),
    { ok: true, revoked: false },
  );
  assert.equal(db.tables.gate_sessions[0].status, "active");

  assert.deepEqual(
    await service.revokeFixedGateAccess({ accessId: "access-a", ownerAdminUserId: "admin-a", revokedByAdminUserId: "admin-a" }),
    { ok: true, revoked: true },
  );
  assert.equal(db.tables.gate_sessions[0].status, "revoked");
  assert.equal(db.tables.gate_sessions[1].status, "active");
  assert.equal((await service.revokeFixedGateAccess({ accessId: "access-a", ownerAdminUserId: "admin-a", revokedByAdminUserId: "admin-a" })).revoked, false);
});
