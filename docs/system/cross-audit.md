# Cross-audit e validação de completude — Etapa 7

**Resultado: PASS.** A BASELINE V1 representa o Rota5 observado com confiança alta, desde que seus limites UNKNOWN/NOT_VALIDATED sejam respeitados. O PASS é da integridade da baseline; o produto continua com gates locais falhos e dois flows quebrados.

## Escopo congelado

- Branch `production`; HEAD e `origin/production`: `a141c6004421fb8442f95493de3ca4ec4d4c997b`.
- Alteração funcional preexistente: `src/lib/tickets/messages.ts`, SHA-256 `c567c2bca0a3494d96ef6242e59139832a4cf648b3a85f02f84ba9f06c937694`.
- Drift funcional criado pelas auditorias: **nenhum**.
- Antes da Etapa 7: 39 documentos + 31 JSONs = 70 artefatos. Depois: 44 + 36 = 80.

## Resultado estrutural

- 36/36 JSONs parseiam; zero IDs duplicados relevantes e zero referências quebradas.
- 17 domains, 66 modules, 56 entrypoints, 140 capabilities, 34 flows, 169 steps e 66 transitions foram revalidados.
- 44 tabelas, 77 migrations, 33 funções SQL, 33 triggers e 2.223 relações foram recontadas.
- 6 integrações, 2 webhooks, 2 crons, 44 env vars, 43 testes e 44 findings permanecem catalogados.
- Cobertura sem classificação: zero; capability funcional sem classificação: zero; entrypoint funcional sem classificação: zero; flow sem status: zero.

## Testes e runtime

`npm test` foi reproduzido com 210 casos, 203 PASS e 7 FAIL em 6 arquivos. `npm run typecheck` mantém 5 diagnósticos com raiz no JSX de `CreateEventModal.tsx:19`. Após remover os geradores temporários, `npm run lint` foi reexecutado e retornou somente os 25 problemas do produto: 1 erro de parse e 24 warnings.

Os 15 checks de runtime permanecem em 12 PASS, 2 PARTIAL e 1 FAIL. Foram usados somente healthchecks, metadados, schema e configuração read-only; nenhum endpoint mutável foi chamado.

## Findings, P0 e busca adversarial

Os 44 findings foram revalidados; nenhum foi removido, adicionado ou reclassificado. Todos os 10 HIGH possuem evidência concreta. A busca por CRITICAL em pagamento, duplicação de ticket, autorização, service role, perda de dados, corrida de reserva, replay, spoofing e produção errada não provou impacto CRITICAL adicional.

Os três P0 permanecem:

- `bug.create-event-invalid-jsx`: não foi possível rebaixar porque bloqueia typecheck/lint e o workspace administrativo principal.
- `bug.combo-redemption-unreachable-consume`: o caminho válido ainda retorna antes da RPC de consumo, impedindo o terminal esperado.
- `risk.vercel-project-identity-drift`: o domínio declarado pertence a `site`, o checkout está ligado a `rota5` e o deployment mais recente de `rota5` aparece em ERROR.

## Segunda passagem independente

Uma reconstrução sem consultar `docs/system` ou `system-knowledge` recontou App Router, scripts NPM/operacionais, migrations, providers, env vars e superfícies de runtime. A comparação não encontrou nova área central, entrypoint, capability, integração ou finding ausente. Marcas Rota5/RockBar/Black House continuam classificadas no catálogo de legado, sem nova contaminação funcional provada.

## Integridade

Foram corrigidas duas contradições documentais: gate duplicado da Etapa 5 no README e snapshot desatualizado da suíte padrão. Há dez grupos de evidência remota ainda NOT_VALIDATED, todos explicitados em `unresolved-evidence.md`. A varredura final não encontrou BOM, U+FFFD, corrupção dos próprios artefatos nem valores de segredo. Nenhuma mudança funcional ou remota foi realizada.
