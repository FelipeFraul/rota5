> **Current Baseline 2.9.0 (2026-09-17):** `MINOR_COMPATIBLE_FUNCTIONAL_CHANGE` on canonical functional source `c7ed2c31eb9c322ef489e71bb59631c39928a1e0`. Fingerprint `889e832d1499df9f968f1cdc820f8f2b138d6e3435a304abd5a50292faa44dd6`; 397 source files, 89 local and remote ledger migrations, 45 tables, 65 SQL functions, 1 sequence, 60 test files and 47 findings. Combo operational notification concurrency is RESOLVED; external ambiguous ACK remains separate. Release blockers: 0; Product and Infrastructure remain DEGRADED.

## Historical snapshot — Baseline 2.5.3 update

Atomicity and admin location consistency moved to RESOLVED and leave the open projections. Add `admin_event_operations` retention/cleanup to a later hardening review without treating it as HIGH/P1 or release-blocking.

# Next actions from existing findings

## HIGH #1 RESOLVED

EXPAND and CONTRACT are APPLIED_AND_VALIDATED, gates A-I passed and authorization is strict-only. OLD_APP rollback is not safe after FINAL_DB. Git auto-deploy remains disabled.

This document orders current findings; it does not introduce features or patches.

## P0 — BEFORE EVOLUTION

Nenhum finding P0 ativo.

## RESOLVED
- `risk.combo-direct-notification-concurrency-can-duplicate-or-stale` — decisões serializadas e intents duráveis; 00600 e Production exato validados; ACK externo ambíguo permanece separado.
- `risk.rate-limit-fails-open` — contrato tri-state, políticas explícitas em 19 boundaries, timeout cancelável de 2s e Production exato validados; histórico SECURITY/MEDIUM/P2 preservado.
- `risk.published-commit-unvalidated` — Vercel REST v13 metadata proves Production `dpl_DmWaACtXLsGd7mPwsKKsk8s2n4gc` serves canonical functional source `c7ed2c31eb9c322ef489e71bb59631c39928a1e0`; documentary HEAD remains intentionally outside runtime parity.
- `risk.combo-metadata-read-modify-write-race` — transições CURRENT de raw_metadata serializadas no PostgreSQL; histórico preservado e limitação de notificação direta separada.
- `legacy.active-brand-contamination` - scoped active surfaces passed Preview and Production validation on `d2b2857c2ccf4023bfd4dc926b7b46b8acf836b8`; historical strings outside the audited scope are not covered.
- `risk.gate-credential-revocation-does-not-revoke-session` — EXPAND/CONTRACT complete; gates A-I and strict runtime passed.
- `bug.create-event-invalid-jsx` — JSX corrigido; typecheck, lint e build passam.
- `bug.combo-redemption-unreachable-consume` — a resolução específica permanece comprovada; `validate_combo_redemption` e o contrato remoto combo relevante foram revalidados no ciclo 2.7.0. Incertezas remotas gerais permanecem nos findings P2 específicos.
- `risk.vercel-project-identity-drift` — cadeia canônica separada como `FelipeFraul/rota5` `production` → Vercel `rota5`; nenhum deployment realizado.
- `risk.latest-rota5-deployment-error` — deployment Production mais recente está READY, serve os aliases canônicos e passou os probes de runtime.
- `bug.event-duplicate-artist-leak` — payload corrente não herda o artista da origem; prova comportamental e suíte 291/291 passa.
- `bug.user-visible-text-corruption` — superfícies documentadas foram corrigidas; provas direcionadas e suíte 291/291 passa.
- `gap.default-test-suite-failing` — suíte padrão corrente passa 280/280, sem skip, todo ou regressão.
- `gap.critical-capability-and-flow-coverage` — 21/21 MUST e 2/2 flows de alto risco possuem cobertura comportamental (métrica de cobertura, não contagem da suíte PostgreSQL).

## P1 — STABILIZATION
Nenhum finding P1 operacionalmente aberto.

## P2 — STRUCTURAL DEBT
- `risk.github-issue-create-replay` — Criação de issue não possui chave de idempotência
- `risk.remote-database-controls-unvalidated` — Controles remotos de banco além do schema visível não foram validados
- `risk.remote-webhook-registration-unvalidated` — Registro remoto dos dois webhooks não foi confirmado
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
- `gap.test-runner-depends-on-untracked-loader` — loader byte-identical permanece versionado; o runner corrente é reproduzível e a suíte passa 291/291.
