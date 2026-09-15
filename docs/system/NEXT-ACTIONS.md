> **Current Baseline 2.7.0 (2026-09-15):** `MINOR_COMPATIBLE_FUNCTIONAL_CHANGE` on canonical functional source `1f504eb4e4a08ab8f8de3ff3a39e1803f625dc27`. Fingerprint `9a9ab1a24c824a879213174a34ba1940eded2eeaf90fca26494a6eb24bc9dbee`; 391 source files, 88 migrations, 45 tables, 63 SQL functions, 1 sequence, 57 test files and 47 findings. `risk.combo-metadata-read-modify-write-race` is RESOLVED; `risk.combo-direct-notification-concurrency-can-duplicate-or-stale` is ACTIVE MEDIUM/P2 and non-release-blocking. Release blockers: 0; Product and Infrastructure remain DEGRADED.

## Historical snapshot — Baseline 2.5.3 update

Atomicity and admin location consistency moved to RESOLVED and leave the open projections. Add `admin_event_operations` retention/cleanup to a later hardening review without treating it as HIGH/P1 or release-blocking.

# Next actions from existing findings

## HIGH #1 RESOLVED

EXPAND and CONTRACT are APPLIED_AND_VALIDATED, gates A-I passed and authorization is strict-only. OLD_APP rollback is not safe after FINAL_DB. Git auto-deploy remains disabled.

This document orders current findings; it does not introduce features or patches.

## P0 — BEFORE EVOLUTION

Nenhum finding P0 ativo.

## RESOLVED
- `risk.combo-metadata-read-modify-write-race` — transições CURRENT de raw_metadata serializadas no PostgreSQL; histórico preservado e limitação de notificação direta separada.
- `legacy.active-brand-contamination` - scoped active surfaces passed Preview and Production validation on `d2b2857c2ccf4023bfd4dc926b7b46b8acf836b8`; historical strings outside the audited scope are not covered.
- `risk.gate-credential-revocation-does-not-revoke-session` — EXPAND/CONTRACT complete; gates A-I and strict runtime passed.
- `bug.create-event-invalid-jsx` — JSX corrigido; typecheck, lint e build passam.
- `bug.combo-redemption-unreachable-consume` — caminho atômico restaurado localmente; equivalência remota continua não validada.
- `risk.vercel-project-identity-drift` — cadeia canônica separada como `FelipeFraul/rota5` `production` → Vercel `rota5`; nenhum deployment realizado.
- `risk.latest-rota5-deployment-error` — deployment Production mais recente está READY, serve os aliases canônicos e passou os probes de runtime.
- `bug.event-duplicate-artist-leak` — payload corrente não herda o artista da origem; prova comportamental e suíte 280/280 passam.
- `bug.user-visible-text-corruption` — superfícies documentadas foram corrigidas; provas direcionadas e suíte 280/280 passam.
- `gap.default-test-suite-failing` — suíte padrão corrente passa 280/280, sem skip, todo ou regressão.
- `gap.critical-capability-and-flow-coverage` — 21/21 MUST e 2/2 flows de alto risco possuem cobertura comportamental (métrica de cobertura, não contagem da suíte PostgreSQL).

## P1 — STABILIZATION
Nenhum finding P1 operacionalmente aberto.

## P2 — STRUCTURAL DEBT
- `risk.combo-direct-notification-concurrency-can-duplicate-or-stale` — Notificações diretas de combo podem duplicar ou ficar stale sob concorrência
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
- `gap.test-runner-depends-on-untracked-loader` — loader byte-identical permanece versionado; o runner corrente é reproduzível e a suíte passa 280/280.
