> **Current Baseline 2.6.2 (2026-09-15):** `PATCH_DOCUMENTARY_CORRECTION` over unchanged functional Baseline 2.6.0/source `0a10618648fc3f873afffd8f60e60bd0396b62e7` and documentary Baseline 2.6.1. This surgical patch corrects only the NEXT-ACTIONS priority placement and stale current Node evidence. Fingerprint remains `8ae8433d11de2ba5c137bd1aa99ee55d2fc85aecb80bbec89847904387c73dbf`; counts remain 390 source files, 87 migrations, 45 tables, 57 SQL functions, 1 sequence, 57 tests and 46 findings. Lifecycle, release blockers (0), health, database and deployment are unchanged.


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
