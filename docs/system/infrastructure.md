> **Current Baseline 2.4.0 (2026-09-14):** canonical HEAD `67845326088eac47452224b00ef1e866036e86f1`; source fingerprint `df6e8976738d2c05dd13d4ea988af12c05531e533f9b8b0feb456084ad82d6c0` across 368 files and 79 migrations. **DEFAULT_NODE_SUITE 236/236 PASS**; **POSTGRES_INTEGRATION_SUITE 1/1 PASS** on PostgreSQL 16 with real `sync_official_table_map_reservation_status`; **QUALITY_GATE run 34867214724 PASS**. Coverage: 21/21 MUST, 0 MUST gaps, 2/2 high-risk flows, 0 high-risk flow gaps, 0 skip, 0 todo, 0 regressions. Finding `gap.critical-capability-and-flow-coverage` is **RESOLVED**. Metrics: ACTIVE HIGH 0, POTENTIAL HIGH 1, OPEN HIGH 1, RESOLVED 9. Product health remains BROKEN by the canonical release-blocker rule; infrastructure health remains DEGRADED. Production remains `dpl_4koAv277hsZ7Z1yCjT5TLPDVgBSa` on functional source `c726902505fd69c2cfef2dec8013ffe0cf0adba3`; current HEAD deployed: **NAO** (post-runtime changes are test/tooling/CI only).

# Baseline 2.1.0 scoped active-brand infrastructure

Git auto-deploy remains disabled. Production deployment `dpl_4koAv277hsZ7Z1yCjT5TLPDVgBSa` is READY and serves exact source `c726902505fd69c2cfef2dec8013ffe0cf0adba3`; Preview `dpl_FyZdcGzqAmPXsghbkjVPxTBCoZG6` passed. Supabase and Ticketeira were unchanged. Infrastructure remains DEGRADED due independent findings.

# Infrastructure AS-IS — Etapa 5

A aplicação é Next.js 16.2.6. A cadeia operacional canônica é GitHub `FelipeFraul/rota5`, branch `production`, ligada ao projeto Vercel `rota5` (`prj_dl7tt8fZbw88ZQV0GhklY0akEwbf`). O projeto Vercel `site` e o GitHub `FelipeFraul/ticketeira` pertencem à Ticketeira e são apenas evidência histórica da causa do finding resolvido.

## Ambientes observados

- **local:** `.env` e `.env.example`; configuração incompleta para o schema central de `getEnv()`.
- **preview:** target e URLs de preview existem na Vercel; banco e modo de integrações dependem de env e seus valores não foram lidos.
- **production:** variáveis e deployments existem no projeto Vercel `rota5`. O source funcional atual está publicado como `dpl_4koAv277hsZ7Z1yCjT5TLPDVgBSa` e o auto-deploy Git permanece desabilitado.

## Configuração funcional

| Arquivo | Efeito |
| --- | --- |
| `package.json` | comandos, dependências e runtime da aplicação |
| `package-lock.json` | resolução exata de dependências |
| `next.config.ts` | headers de segurança e CORS de assets estáticos |
| `vercel.json` | dois schedules cron e bloqueio temporário de deployments Git |
| `tsconfig.json` | compilação e aliases |
| `eslint.config.mjs` | validação estática |
| `src/proxy.ts` | proteção edge e sessões |
| `src/lib/env.ts` | validação central de ambiente |

Flags adicionais incluem TTLs, `PAYMENT_PROVIDER`, lista de telefones Codex, atraso de combo e `FULL_INTENT_AUDIT`. Valores não foram registrados.

## Storage

Assets estáticos seguem o build Vercel. QR e mapas são gerados em memória/base64 ou em `.tmp` por ferramentas; referências operacionais aparecem no banco. Existe a variável `SEAT_MAP_STORAGE_BUCKET`, mas não há chamada `.storage` no código e o Supabase retornou zero buckets.

## Security boundaries

| Origem | Destino | Auth | Validação | Trust |
| --- | --- | --- | --- | --- |
| browser | API | cookies, segredo interno ou superfície pública conforme rota | Zod/validação de handler e proxy | input não confiável |
| API | Supabase | service role | autorização da aplicação antes da operação | servidor contorna RLS |
| provider | webhook | segredo Z-API ou assinatura Mercado Pago | assinatura/payload/deduplicação | rede externa |
| Vercel cron | API | Bearer CRON_SECRET | comparação do segredo | scheduler externo |
| scripts | Supabase | service role/DATABASE_URL | pré-condições do script | operador local |
| admin/gate/kitchen | API | sessão assinada, segredo ou credencial de acesso | permissão e escopo de evento | cliente autenticado |
