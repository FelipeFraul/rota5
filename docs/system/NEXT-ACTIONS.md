> **Current Baseline 2.5.2 (2026-09-14):** `PATCH_DOCUMENTARY_CORRECTION` on unchanged repository source `e931d66d03a620d5e26588c8f6c8714c62ef5d1d` (fingerprint `6483294a8c2a4e758fdb965f2f9dc41bef5c539b064b9d727239a3ccd6059954`, 379 files, 83 migrations). Atomicity and admin location consistency remain **RESOLVED**. Findings and health are unchanged: 45 total, 13 RESOLVED, 21 ACTIVE, 6 POTENTIAL, 5 NOT_VALIDATED, 0 release blockers; PRODUCT_HEALTH and INFRASTRUCTURE_HEALTH are **DEGRADED**. Quality remains 257/257 Node, 2/2 PostgreSQL 16 and Quality Gate 34898804387 PASS. Production `dpl_JKrBje3wTYvc1VBCcNKkVb8FV2mf` remains on application source `148b8200a44f4eeb49e004af45060a302bac9f20`; no runtime, database, deployment or functional change occurred.

## Baseline 2.5.2 update

Atomicity and admin location consistency moved to RESOLVED and leave the open projections. Add `admin_event_operations` retention/cleanup to a later hardening review without treating it as HIGH/P1 or release-blocking.

# Next actions from existing findings

## HIGH #1 RESOLVED

EXPAND and CONTRACT are APPLIED_AND_VALIDATED, gates A-I passed and authorization is strict-only. OLD_APP rollback is not safe after FINAL_DB. Git auto-deploy remains disabled.

This document orders current findings; it does not introduce features or patches.

## P0 — BEFORE EVOLUTION

Nenhum finding P0 ativo.

## RESOLVED
- `legacy.active-brand-contamination` - scoped active surfaces passed Preview and Production validation on `d2b2857c2ccf4023bfd4dc926b7b46b8acf836b8`; historical strings outside the audited scope are not covered.
- `risk.gate-credential-revocation-does-not-revoke-session` — EXPAND/CONTRACT complete; gates A-I and strict runtime passed.
- `bug.create-event-invalid-jsx` — JSX corrigido; typecheck, lint e build passam.
- `bug.combo-redemption-unreachable-consume` — caminho atômico restaurado localmente; equivalência remota continua não validada.
- `risk.vercel-project-identity-drift` — cadeia canônica separada como `FelipeFraul/rota5` `production` → Vercel `rota5`; nenhum deployment realizado.
- `risk.latest-rota5-deployment-error` — deployment Production mais recente está READY, serve os aliases canônicos e passou os probes de runtime.
- `bug.event-duplicate-artist-leak` — payload corrente não herda o artista da origem; prova comportamental e suíte 257/257 passam.
- `bug.user-visible-text-corruption` — superfícies documentadas foram corrigidas; provas direcionadas e suíte 257/257 passam.
- `gap.default-test-suite-failing` — suíte padrão corrente passa 257/257, sem skip, todo ou regressão.
- `gap.critical-capability-and-flow-coverage` — 21/21 MUST e 2/2 flows de alto risco possuem cobertura comportamental.

## P1 — ACTIVE AND POTENTIAL STABILIZATION
- `risk.payment-confirmed-before-external-delivery` (POTENTIAL) — Confirmação atômica e entrega externa formam fronteira de consistência eventual
- `gap.partial-flows-lack-end-to-end-proof` — Sete flows parciais não possuem prova ponta a ponta

## P2 — STRUCTURAL DEBT
- `risk.combo-metadata-read-modify-write-race` — Atualizações concorrentes podem sobrescrever metadados do combo
- `risk.github-issue-create-replay` — Criação de issue não possui chave de idempotência
- `risk.rate-limit-fails-open` — Falha do rate limiter libera a requisição
- `risk.remote-database-controls-unvalidated` — Controles remotos de banco além do schema visível não foram validados
- `risk.remote-webhook-registration-unvalidated` — Registro remoto dos dois webhooks não foi confirmado
- `risk.published-commit-unvalidated` — Commit publicado não pode ser reconciliado com o HEAD auditado
- `risk.local-runtime-env-incomplete` — Ambiente local não contém todas as variáveis exigidas
- `gap.critical-flow-correlation` — Fluxos críticos não têm correlação ponta a ponta
- `debt.router-responsibility-concentration` — Roteador conversacional concentra coordenação de muitos domínios
- `debt.zapi-webhook-responsibility-coupling` — Handler Z-API acopla transporte, deduplicação, automação e entrega
- `gap.real-integration-tests-outside-default` — Testes reais e de integração ficam fora da suíte padrão
- `gap.source-contract-assertion-bias` — Parte relevante dos testes valida texto-fonte e regex de implementação
- `gap.remote-database-behavior-tests` — Equivalência remota de RPCs, triggers e constraints não tem teste de baseline
- `orphan.gate-session-revoke` — Capability de revogar sessão de leitor não tem entrypoint
- `legacy.table-map-presentation-disabled` — Mapa oficial e cortesia permanecem implementados, mas desativados na apresentação Rota5
- `debt.direct-supabase-access-spread` — Acesso privilegiado ao Supabase está espalhado por services e routes
- `risk.whatsapp-conversation-context-race` — Mensagens simultâneas podem competir pela atualização do contexto conversacional
- `risk.production-capable-scripts-outside-test-isolation` — Scripts reais podem ler ou alterar ambientes remotos por configuração
- `risk.service-role-application-authorization-boundary` — A autorização da aplicação protege operações que usam service role

## LATER
- `debt.seat-map-storage-contract-drift` (P3) — Variável de bucket existe sem consumidor nem bucket remoto
- `dead.brand-logo-component` (P3) — BrandLogo.tsx não possui consumidor encontrado
- `orphan.ticket-validation-history` (P3) — Capability de histórico de validações não tem entrypoint
- `orphan.courtesy-event-limit` (P3) — Limite global de cortesia existe sem entrypoint
- `orphan.gate-sessions-list` (P3) — Listagem de sessões de leitor não tem entrypoint
- `orphan.seat-map-renders-table` (P3) — seat_map_renders não tem consumidor de aplicação confirmado
- `debt.large-mixed-service-modules` (P3) — Serviços grandes misturam consulta, regra, formatting e efeitos
- `debt.payment-reconciliation-duplication-is-intentional` (P4) — Webhook e consulta de status repetem confirmação com guardas idempotentes
- `risk.checkout-status-fixed-polling` (P3) — Checkouts consultam status a cada cinco segundos sem backoff
- `gap.client-errors-not-persisted` (P3) — Falhas de polling e scanner ficam apenas no estado do cliente
- `debt.distributed-status-literals` (P4) — Estados e mensagens de negócio estão distribuídos em arquivos extensos

## RESOLVED STABILIZATION ITEMS
- `gap.test-runner-depends-on-untracked-loader` — loader byte-identical permanece versionado; o runner corrente é reproduzível e a suíte passa 257/257.
