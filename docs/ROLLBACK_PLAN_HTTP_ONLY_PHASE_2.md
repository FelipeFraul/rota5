# Rollback Plan - HttpOnly Token Phase 2

Criado em 2026-05-27 12:58:09 -03.

Este documento registra o ponto seguro antes de iniciar a Fase 2 de hardening com tokens em cookie `HttpOnly` e os passos de rollback durante a implementacao.

## Ponto Seguro

- Branch de trabalho: `hardening/http-only-token-phase-2`
- Branch estavel marcada: `main`
- Commit seguro: `b6f7b97839cb6daf803d3c6676731c88b657c0cc`
- Commit seguro curto: `b6f7b97 Minimize public frontend DTOs`
- Tag de rollback: `pre-http-only-token-phase-2`
- Deployment seguro Vercel: `https://site-qabye33me-fraulproenca-gmailcoms-projects.vercel.app`
- Deployment id: `dpl_6WphQxzUdwhVU516pXBNWeZ2ttc2`
- Alias de producao: `https://site-phi-seven-72.vercel.app`
- Status do deployment: `Ready`
- Criado na Vercel em: `Wed May 27 2026 12:47:03 GMT-0300`

## Estado Validado Antes da Fase 2

Validacao local no commit seguro:

```bash
git status --short
git log -1 --oneline
npm run lint
npm run typecheck
npm run build
```

Resultado: worktree limpa, commit `b6f7b97`, lint/typecheck/build passaram.

Validacao de producao:

- `GET /admin/login/token-invalido` retornou pagina segura `200`;
- `GET /gate/session/token-invalido` retornou pagina segura `200`;
- `POST /api/webhook/zapi` sem segredo retornou `401`;
- `POST /api/webhook/payment/mercado-pago` sem assinatura retornou `401`;
- `POST /api/checkout/mercado-pago` sem secret retornou `401`;
- `POST /api/cron/expire-reservations` sem bearer retornou `401`.

## Como Voltar Codigo

Para voltar a trabalhar no estado seguro:

```bash
git checkout main
git fetch origin --tags
git checkout pre-http-only-token-phase-2
```

Para restaurar `main` exatamente para a tag em caso de emergencia operacional, prefira criar um revert commit dos commits da Fase 2 em vez de reescrever historico publico:

```bash
git checkout main
git pull origin main
git revert <commit-da-fase-2>..HEAD
git push origin main
```

Se for absolutamente necessario resetar localmente para investigar:

```bash
git checkout -b rollback/inspect-pre-http-only-token-phase-2 pre-http-only-token-phase-2
```

Nao usar `git reset --hard` em `main` compartilhada sem decisao explicita.

## Como Voltar Deploy

Opcao preferencial:

- usar Vercel Instant Rollback para o deployment seguro `dpl_6WphQxzUdwhVU516pXBNWeZ2ttc2`;
- ou promover pelo painel o deployment `https://site-qabye33me-fraulproenca-gmailcoms-projects.vercel.app`.

Observacao: em plano Hobby, rollback instantaneo pode ser limitado ao deployment anterior. Se o painel nao permitir rollback direto para o deployment seguro, promover um novo deploy a partir da tag `pre-http-only-token-phase-2`.

Comando de apoio para inspecionar:

```bash
npx vercel@latest inspect site-qabye33me-fraulproenca-gmailcoms-projects.vercel.app
```

## Como Voltar Banco

Neste checkpoint, nenhuma migration nova da Fase 2 foi criada ou aplicada. A implementacao de cookie `HttpOnly` tambem nao exige migration ou alteracao de RPC.

Se nenhuma migration da Fase 2 tiver sido aplicada, nao ha acao de banco no rollback.

Status de backup/PITR Supabase neste ambiente:

- `SUPABASE_ACCESS_TOKEN` nao esta disponivel;
- o projeto Supabase nao esta linkado localmente;
- `npx supabase projects list` falhou por ausencia de access token;
- PITR/backup nao foi confirmado pelo CLI neste ambiente.

Postura segura: tratar PITR como nao confirmado/indisponivel ate verificar no dashboard Supabase antes de qualquer migration. Se PITR nao estiver disponivel no plano atual, registrar explicitamente antes de aplicar mudancas de banco.

Regras para qualquer migration futura da Fase 2:

- nao aplicar migration destrutiva;
- para tabelas novas, criar sem alterar dados existentes;
- nao dropar coluna ou tabela;
- nao alterar RPC critica sem script de rollback;
- se houver migration nova, criar migration reversivel ou migration de rollback separada;
- se houver problema grave de dados, usar backup/PITR somente quando confirmado disponivel.

## Criterios de Rollback

Executar rollback se qualquer item ocorrer:

- admin nao consegue logar;
- portaria nao abre;
- scan nao valida;
- webhooks passam a retornar status incorreto ou deixam de proteger `401`;
- `npm run build` falha;
- `npm run typecheck` falha;
- erro `500` em rotas criticas;
- aumento de erros em producao relacionado a admin, portaria, scan ou webhooks.

## Validacao Pos-Rollback

Rodar localmente:

```bash
npm run lint
npm run typecheck
npm run build
git status --short
```

Validar producao:

```bash
curl -s -D - -o /dev/null https://site-phi-seven-72.vercel.app/admin/login/token-invalido
curl -s -D - -o /dev/null https://site-phi-seven-72.vercel.app/gate/session/token-invalido
curl -s -D - -o /dev/null -X POST https://site-phi-seven-72.vercel.app/api/webhook/zapi
curl -s -D - -o /dev/null -X POST https://site-phi-seven-72.vercel.app/api/webhook/payment/mercado-pago
curl -s -D - -o /dev/null -X POST https://site-phi-seven-72.vercel.app/api/checkout/mercado-pago
curl -s -D - -o /dev/null -X POST https://site-phi-seven-72.vercel.app/api/cron/expire-reservations
curl -s -i -X POST https://site-phi-seven-72.vercel.app/api/gate/session/scan \
  -H 'content-type: application/json' \
  -d '{"ticketToken":"invalid-ticket-token"}'
```

Resultado esperado:

- paginas admin/portaria com token invalido retornam pagina segura;
- webhooks/checkout/cron sem segredo retornam `401`;
- scan invalido retorna resposta segura sem dados de ingresso;
- headers de seguranca continuam presentes.

## Implementacao da Fase 2

Estrategia aplicada:

- `/admin/login/{token}` e `/gate/session/{token}` permanecem como rotas de bootstrap;
- o bootstrap valida o token no servidor, define cookie temporario `HttpOnly` e redireciona para a URL limpa;
- `/admin/login` e `/gate/session` renderizam a experiencia somente quando o cookie ainda e valido;
- `/api/admin/login/verify`, `/api/gate/session/validate` e `/api/gate/session/scan` leem o token pelo cookie e nao aceitam mais o token bruto no body;
- nenhum schema, dado existente ou RPC critica foi alterado.

Cookies:

- `admin_login_challenge`: `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, `Max-Age` alinhado ao challenge;
- `gate_session`: `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, `Max-Age` alinhado a expiracao da sessao de portaria.

Visibilidade restante por design:

- o token aparece na URL apenas durante o primeiro acesso ao link de bootstrap;
- a senha individual digitada aparece no POST do proprio navegador;
- o codigo unico continua aparecendo para o admin enviar no WhatsApp;
- o token do QR lido continua no request de scan, pois o navegador precisa ler o QR;
- setor/assento podem aparecer em scan permitido para conferencia operacional.
