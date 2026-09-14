import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { formatSingleEventMoreInfoOptions } from "../src/lib/tickets/router.ts";
import { classifyPublicAvailability } from "../src/lib/tickets/services/publicAvailability.ts";

const source = readFileSync(
  new URL("../src/lib/tickets/services/publicAvailability.ts", import.meta.url),
  "utf8",
);
const eventsSource = readFileSync(
  new URL("../src/lib/tickets/services/events.ts", import.meta.url),
  "utf8",
);
const adminEventsSource = readFileSync(
  new URL("../src/lib/tickets/services/adminEvents.ts", import.meta.url),
  "utf8",
);
const routerSource = readFileSync(
  new URL("../src/lib/tickets/router.ts", import.meta.url),
  "utf8",
);

const baseAvailableInput = {
  eventStatus: "published",
  sessionStatus: "sales_open",
  activeSalesOptionsCount: 1,
  endedSalesOptionsCount: 0,
  futureSalesOptionsCount: 0,
  availableCapacity: 10,
  totalCapacity: 20,
};

test("classificacao publica marca available quando venda e capacidade existem", () => {
  assert.equal(classifyPublicAvailability(baseAvailableInput), "available");
});

test("classificacao publica marca sold_out sem persistir SOLD OUT no banco", () => {
  assert.equal(
    classifyPublicAvailability({
      ...baseAvailableInput,
      availableCapacity: 0,
      totalCapacity: 20,
    }),
    "sold_out",
  );
  assert.doesNotMatch(source, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
});

test("classificacao publica marca sales_closed por status da sessao", () => {
  assert.equal(
    classifyPublicAvailability({
      ...baseAvailableInput,
      sessionStatus: "sales_closed",
    }),
    "sales_closed",
  );
});

test("classificacao publica marca sales_closed por janela de preco encerrada", () => {
  assert.equal(
    classifyPublicAvailability({
      ...baseAvailableInput,
      activeSalesOptionsCount: 0,
      endedSalesOptionsCount: 2,
      futureSalesOptionsCount: 0,
      availableCapacity: 10,
    }),
    "sales_closed",
  );
});

test("classificacao publica marca unavailable quando falta venda ativa e ha preco futuro", () => {
  assert.equal(
    classifyPublicAvailability({
      ...baseAvailableInput,
      activeSalesOptionsCount: 0,
      endedSalesOptionsCount: 0,
      futureSalesOptionsCount: 1,
      availableCapacity: 10,
    }),
    "unavailable",
  );
});

test("classificacao publica marca unavailable para venue inativo ou sessao nao compravel", () => {
  assert.equal(
    classifyPublicAvailability({
      ...baseAvailableInput,
      sessionVenueStatus: "inactive",
    }),
    "unavailable",
  );
  assert.equal(
    classifyPublicAvailability({
      ...baseAvailableInput,
      sessionStatus: "paused",
    }),
    "unavailable",
  );
});

test("classificacao publica marca cancelled para evento ou sessao cancelados", () => {
  assert.equal(
    classifyPublicAvailability({
      ...baseAvailableInput,
      eventStatus: "cancelled",
    }),
    "cancelled",
  );
  assert.equal(
    classifyPublicAvailability({
      ...baseAvailableInput,
      sessionStatus: "cancelled",
    }),
    "cancelled",
  );
});

test("classificacao publica marca paused para evento draft ou pausado", () => {
  assert.equal(
    classifyPublicAvailability({
      ...baseAvailableInput,
      eventStatus: "draft",
    }),
    "paused",
  );
  assert.equal(
    classifyPublicAvailability({
      ...baseAvailableInput,
      eventStatus: "paused",
    }),
    "paused",
  );
});

test("buscas publicas retornam somente available sold_out e sales_closed", () => {
  assert.match(eventsSource, /availabilityStatus\?:\s*PublicAvailabilityStatus/);
  assert.match(eventsSource, /getPublicAvailabilityStatusForSession/);
  assert.match(eventsSource, /isPublicAvailabilityListable\(availabilityStatus\)/);
  assert.match(eventsSource, /purchasableResults\.push\(publicResult\)/);
  assert.match(eventsSource, /getPublicVisibleSessionStatuses\("issued_access"\)/);
  assert.doesNotMatch(eventsSource, /listAvailableSections/);
});

test("busca por nome comando TODOS listagem por data e opcoes usam classificacao", () => {
  assert.match(
    eventsSource,
    /searchEvents[\s\S]*searchEventsRankedInDatabase[\s\S]*withPublicAvailability\(result\)/,
  );
  assert.match(
    eventsSource,
    /const matchedSessions[\s\S]*withPublicAvailability\(result\)/,
  );
  assert.match(
    eventsSource,
    /listAllPublicEventsByDate[\s\S]*withPublicAvailability\(result\)/,
  );
  assert.match(
    eventsSource,
    /return \{\s*\.\.\.publicResult,\s*availabilityStatus,\s*\}/,
  );
});

test("eventos passados continuam ocultos pela politica publica central", () => {
  assert.match(eventsSource, /isPublicEventVisible\(\{[\s\S]*purpose:\s*"issued_access"/);
  assert.match(eventsSource, /getPublicEventVisibilityQueryFloorIso\(\)/);
  assert.match(source, /PUBLIC_LISTABLE_AVAILABILITY_STATUSES = \[[\s\S]*"available"[\s\S]*"sold_out"[\s\S]*"sales_closed"/);
  assert.doesNotMatch(
    source.match(/PUBLIC_LISTABLE_AVAILABILITY_STATUSES = \[[\s\S]*?\]/)?.[0] ?? "",
    /cancelled|paused|unavailable/,
  );
});

test("acao buy revalida disponibilidade real antes de iniciar setores", () => {
  assert.match(routerSource, /getCurrentPublicAvailabilityStatusForSession/);
  assert.match(routerSource, /async function renderBuyerSectionsStepAfterBuyRevalidation/);
  assert.match(
    routerSource,
    /const availabilityStatus = await getCurrentPublicAvailabilityStatusForSession[\s\S]*if \(availabilityStatus !== "available"\)[\s\S]*return \{\s*reply: formatBlockedBuyAvailabilityReply\(availabilityStatus\)/,
  );
  assert.match(
    routerSource,
    /availabilityStatus !== "available"[\s\S]*selectedSection: undefined[\s\S]*selectedSeat: undefined[\s\S]*reservation: undefined[\s\S]*payment: undefined/,
  );
  assert.match(
    routerSource,
    /return renderBuyerSectionsStep\(\{[\s\S]*availabilityStatus/,
  );
});

test("acao buy responde sold out vendas encerradas e indisponivel sem checkout", () => {
  assert.match(
    routerSource,
    /function formatBlockedBuyAvailabilityReply[\s\S]*status === "sold_out"[\s\S]*return "SOLD OUT"/,
  );
  assert.match(
    routerSource,
    /function formatBlockedBuyAvailabilityReply[\s\S]*status === "sales_closed"[\s\S]*return "VENDAS ENCERRADAS"/,
  );
  assert.match(
    routerSource,
    /function formatBlockedBuyAvailabilityReply[\s\S]*return TICKET_MESSAGES\.eventOptionUnavailable/,
  );
  assert.doesNotMatch(
    routerSource.match(/if \(availabilityStatus !== "available"\)[\s\S]*?return renderBuyerSectionsStep/)?.[0] ?? "",
    /createCheckoutForReservation|reserveTicketCart|listAvailableSections/,
  );
});

test("buy usa acoes explicitas e numero invalido nao inicia checkout", () => {
  assert.match(routerSource, /findPublicEventActionByOption\(previousState\.lastEvents, selectedOption\)/);
  assert.match(
    routerSource,
    /if \(!selectedAction \|\| !selectedContextEvent \|\| selectedOption < 1\) \{[\s\S]*reply: TICKET_MESSAGES\.numericInvalidOption/,
  );
  assert.doesNotMatch(routerSource, /Math\.floor\(\(selectedOption - 1\) \/ 2\)|selectedOption % 2/);
});

test("more info continua disponivel para sold out e vendas encerradas", () => {
  assert.match(
    routerSource,
    /async function buildEventMoreInfoSelection[\s\S]*getCurrentPublicAvailabilityStatusForSession\(\{[\s\S]*eventId: event\.eventId[\s\S]*sessionId: event\.sessionId/,
  );
  assert.match(
    routerSource,
    /availabilityStatus: availabilityStatus \?\? event\.availabilityStatus/,
  );
  for (const availabilityStatus of ["sold_out", "sales_closed"]) {
    const reply = formatSingleEventMoreInfoOptions({ availabilityStatus });
    assert.match(reply, /\bNOVO\b/);
    assert.doesNotMatch(reply, /comprar/i);
  }
  assert.doesNotMatch(
    routerSource.match(/function formatSingleEventMoreInfoOptions[\s\S]*?function buildSelectedEvent/)?.[0] ?? "",
    /SOLD OUT[\s\S]*Digite \*1\* para \*comprar\*|VENDAS ENCERRADAS[\s\S]*Digite \*1\* para \*comprar\*/,
  );
});

test("classificador consultavel retorna estados bloqueados para revalidacao de buy", () => {
  assert.match(source, /getCurrentPublicAvailabilityStatusForSession/);
  assert.match(source, /new Date\(data\.starts_at\)\.getTime\(\) <= now\.getTime\(\)[\s\S]*return "unavailable"/);
  assert.match(
    source,
    /return getPublicAvailabilityStatusForSession\(\{[\s\S]*eventStatus: data\.events\.status[\s\S]*sessionStatus: data\.status/,
  );
});

test("reducao manual ate zero resulta em sold out publico sem campo persistido", () => {
  assert.equal(
    classifyPublicAvailability({
      ...baseAvailableInput,
      availableCapacity: 0,
      totalCapacity: 10,
    }),
    "sold_out",
  );
  assert.match(
    source,
    /availableCapacity: effectiveSeats\.filter\([\s\S]*seat\.status === "available" && seat\.seats\?\.status === "active"/,
  );
  assert.match(source, /totalCapacity: effectiveSeats\.length/);
  assert.doesNotMatch(source, /sold_out[\s\S]*\.update\(|\.update\([\s\S]*sold_out/);
});

test("reducao abaixo do comprometido fica bloqueada", () => {
  const migration = readFileSync(
    new URL(
      "../supabase/migrations/20260803000100_create_update_admin_section_capacity_rpc.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(adminEventsSource, /\.rpc\("update_admin_section_capacity"/);
  assert.match(migration, /ss\.status in \('reserved', 'sold'\)/);
  assert.match(migration, /raise exception 'capacity_below_busy'/);
});

test("reducao preserva vendidos e reservados e bloqueia apenas disponiveis", () => {
  const migration = readFileSync(
    new URL(
      "../supabase/migrations/20260803000100_create_update_admin_section_capacity_rpc.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(migration, /ss\.status = 'available'/);
  assert.match(migration, /set status = 'blocked'/);
  assert.doesNotMatch(migration, /set status = 'sold'|set status = 'reserved'/);
});

test("aumento posterior restaura available automaticamente", () => {
  const migration = readFileSync(
    new URL(
      "../supabase/migrations/20260803000100_create_update_admin_section_capacity_rpc.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(migration, /set status = 'available'/);
  assert.match(migration, /ss\.status = 'blocked'/);
  assert.equal(
    classifyPublicAvailability({
      ...baseAvailableInput,
      availableCapacity: 1,
      totalCapacity: 10,
    }),
    "available",
  );
});

test("busca e todos refletem reducao manual pela classificacao publica", () => {
  assert.match(eventsSource, /withPublicAvailability\(result\)/);
  assert.match(eventsSource, /getPublicAvailabilityStatusForSession/);
  assert.match(routerSource, /formatAllEventsReply\(previousState\.lastEvents \?\? \[\]\)/);
  assert.match(routerSource, /buildAllEventsOutboundMessages/);
});
