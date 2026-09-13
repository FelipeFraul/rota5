# Next actions from existing findings

## CONTROLLED HIGH #1 ROLLOUT

The immediate action is to publish the local NEW_APP commit `cacbc4306abc82ce2ef4469125c62c3b6a8bf1b8` together with Baseline 1.4.0 to GitHub while `git.deploymentEnabled=false` remains in force. Then audit and preserve artifact identity. Remote EXPAND may only be considered after that publication/control step. CONTRACT is not the immediate next action and remains a draft.

# Next actions from existing findings

This document orders current findings; it does not introduce features or patches.

## P0 — BEFORE EVOLUTION

Nenhum finding P0 ativo.

## RESOLVED
- `bug.create-event-invalid-jsx` — JSX corrigido; typecheck, lint e build passam.
- `bug.combo-redemption-unreachable-consume` — caminho atômico restaurado localmente; equivalência remota continua não validada.
- `risk.vercel-project-identity-drift` — cadeia canônica separada como `FelipeFraul/rota5` `production` → Vercel `rota5`; nenhum deployment realizado.

## P1 — ACTIVE AND POTENTIAL STABILIZATION
- `bug.event-duplicate-artist-leak` — Duplicação de evento preserva artista do evento de origem
- `bug.user-visible-text-corruption` — Textos ativos contêm mojibake e substituições por interrogação
- `legacy.active-brand-contamination` — Superfícies Rota5 exibem referências e assets Black House/RockBar
- `risk.gate-credential-revocation-does-not-revoke-session` — Pausa/revogação da credencial não invalida sessões de leitor já emitidas
- `risk.admin-event-multistep-partial-state` (POTENTIAL) — Criação de evento e catálogo inicial cruza entidades sem transação única
- `risk.latest-rota5-deployment-error` — Deployment mais recente do projeto rota5 está em ERROR
- `gap.default-test-suite-failing` — Suíte padrão está vermelha com sete casos falhos
- `gap.critical-capability-and-flow-coverage` — Capabilities e flows relevantes não têm teste direto
- `gap.test-runner-depends-on-untracked-loader` — npm test depende de loader em diretório temporário não versionado
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
