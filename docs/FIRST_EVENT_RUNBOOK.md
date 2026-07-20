# Runbook Do Primeiro Evento Real

Este runbook orienta a operação do primeiro evento real com o sistema em produção. Ele cobre pré-venda, vendas, suporte, portaria, contingência e fechamento.

Ele não substitui autorização operacional. Em caso de comportamento inesperado, pare o fluxo afetado, registre evidências redigidas e acione o responsável técnico.

## 1. Antes De Abrir Vendas

### Checklist Técnico

- [ ] Confirmar envs de produção na Vercel sem imprimir valores reais.
- [ ] Confirmar deploy atual de produção e commit esperado.
- [ ] Confirmar WAF/rate limit ativo para rotas sensíveis.
- [ ] Confirmar headers de segurança e CORS sem wildcard.
- [ ] Confirmar `POST /api/webhook/zapi` sem segredo retorna `401`.
- [ ] Confirmar `POST /api/webhook/payment/mercado-pago` sem assinatura retorna `401`.
- [ ] Confirmar `POST /api/checkout/mercado-pago` sem secret retorna `401`.
- [ ] Confirmar `POST /api/cron/expire-reservations` sem bearer retorna `401`.
- [ ] Confirmar cron/agendador externo de expiração de reservas ativo.
- [ ] Confirmar login admin tokenizado funcionando.
- [ ] Confirmar Diretor, Gerente e Operador acessam somente menus permitidos.
- [ ] Confirmar que não existe admin ativo sem senha individual.
- [ ] Confirmar que links antigos de portaria foram descartados.
- [ ] Gerar novos links de portaria no dia da operação.
- [ ] Fazer compra teste de baixo valor.
- [ ] Confirmar QR recebido no WhatsApp.
- [ ] Confirmar página pública do ticket.
- [ ] Confirmar portaria validando QR correto.
- [ ] Confirmar segunda leitura como `already_used`.
- [ ] Confirmar QR de outro evento como `wrong_event`, se houver ambiente/dado de teste seguro.
- [ ] Confirmar relatório básico de vendas/check-ins.

### Critérios Para Abrir Vendas

- Compra teste aprovada e ticket emitido.
- Webhook Mercado Pago confirmado.
- QR entregue por WhatsApp ou contingência de reenvio definida.
- Portaria testada com token novo.
- Responsáveis técnico e operacional cientes da janela de abertura.

## 2. Durante Vendas

### Consultar Pedido Por Telefone

1. Entrar no menu administrativo.
2. Abrir `Ingressos e Pedidos`.
3. Usar busca por telefone.
4. Conferir somente dados necessários para atendimento.
5. Não compartilhar prints com dados de cliente em grupos abertos.

### Consultar Ticket Por Código

1. Abrir `Ingressos e Pedidos`.
2. Usar busca por código.
3. Conferir evento, sessão, setor, status e últimas validações.
4. Não expor token, QR bruto, hashes ou ids internos.

### Cancelar Reserva Pendente

1. Confirmar que a reserva está pendente.
2. Confirmar com o responsável operacional antes de cancelar em caso de dúvida.
3. Usar o fluxo administrativo de cancelamento de reserva pendente.
4. Registrar motivo em canal interno.

### Comprador Não Recebeu QR

- Verificar se o pagamento foi aprovado.
- Verificar se o pedido/ticket foi emitido.
- Conferir se o número WhatsApp do comprador está correto.
- Se Z-API estiver instável, registrar caso para reenvio/atendimento manual.
- Nunca reenviar QR para número diferente sem validação operacional.

### Pagamento Aprovado Mas QR Não Chegou

- Confirmar status no Mercado Pago.
- Confirmar se o webhook foi processado.
- Consultar pedido por telefone/código.
- Se ticket existir, orientar suporte conforme fluxo de reenvio disponível.
- Se ticket não existir e pagamento estiver aprovado, acionar responsável técnico.

### Mercado Pago Atrasou Webhook

- Aguardar alguns minutos e monitorar logs.
- Não emitir ingresso manualmente no banco.
- Não alterar status direto em tabela.
- Se atraso persistir, acionar responsável técnico para verificar webhook e API Mercado Pago.

### WhatsApp/Z-API Falhou

- Verificar se compradores continuam recebendo mensagens.
- Conferir painel/logs da Z-API.
- Se falha for geral, pausar divulgação ativa e registrar atendimento manual.
- Não expor tokens/QRs em grupos abertos.

### Comprador Digitou Errado

- Orientar o comprador a buscar novamente o evento ou usar opções do menu.
- Se houver reserva errada, avaliar cancelamento pendente pelo admin.
- Não editar pedido pago manualmente.

### O Que Não Fazer Manualmente

- Não alterar pagamento, pedido, reserva ou ticket direto no banco durante operação normal.
- Não marcar ticket como usado/desusado manualmente.
- Não criar QR manual fora do sistema.
- Não compartilhar service role, secrets, hashes ou tokens.

## 3. Antes Da Portaria

### Checklist Operacional

- [ ] Celulares da portaria carregados.
- [ ] Carregadores e power banks disponíveis.
- [ ] Internet principal testada.
- [ ] Internet backup testada.
- [ ] Links novos de portaria gerados no dia.
- [ ] Links antigos descartados.
- [ ] Cada celular abre o link novo.
- [ ] Cada celular consegue abrir a câmera.
- [ ] Teste com QR válido retorna `ACESSO LIBERADO`.
- [ ] Segunda leitura retorna `INGRESSO JÁ UTILIZADO`.
- [ ] QR cancelado retorna `INGRESSO CANCELADO`, se houver dado seguro.
- [ ] Ingresso de outro evento/sessão retorna recusa correta, se houver dado seguro.
- [ ] Responsável técnico de plantão definido.
- [ ] Responsável operacional de plantão definido.
- [ ] Canal interno de suporte definido.

## 4. Durante A Portaria

### ACESSO LIBERADO

- Liberar entrada.
- Não fotografar QR do cliente.
- Se houver setor/assento exibido, usar apenas para conferência operacional.

### INGRESSO JÁ USADO

- Não liberar automaticamente.
- Encaminhar para responsável operacional.
- Conferir documento/nome somente se houver processo definido.
- Acionar responsável técnico se houver indício de erro sistêmico.

### INGRESSO CANCELADO

- Não liberar.
- Encaminhar para suporte presencial.
- Consultar pedido/ticket no admin se necessário.

### INGRESSO DE OUTRO EVENTO

- Não liberar.
- Orientar cliente a procurar suporte.
- Não informar dados do evento errado além da mensagem segura já exibida.

### INGRESSO DE OUTRA SESSÃO

- Não liberar naquela sessão.
- Encaminhar para suporte operacional.

### QR Inválido

- Pedir para o cliente abrir a mensagem original do WhatsApp.
- Verificar brilho/tela/quebra de imagem.
- Se persistir, encaminhar para suporte.

### Cliente Sem Internet Ou Sem WhatsApp

- Encaminhar para suporte.
- Buscar ticket por código/telefone no admin somente se o processo operacional permitir.
- Não aceitar print de QR em grupo aberto como prova única sem conferência.

### Celular Da Portaria Travou

- Fechar e reabrir navegador.
- Reabrir link novo de portaria.
- Trocar para aparelho backup se necessário.

### Leitor Não Abre Câmera

- Conferir permissão de câmera do navegador.
- Testar outro navegador.
- Usar aparelho backup.

### Internet Caiu Ou Há Lentidão

- Trocar para rede backup.
- Reduzir aparelhos na rede, se necessário.
- Acionar responsável técnico se scanner não responder.

### Fallback Manual Por Código

Usar somente se existir fluxo administrativo disponível e autorizado. O fallback deve consultar o ticket no admin, nunca alterar banco direto.

### Quando Chamar O Responsável Técnico

- Rotas retornando `500`.
- Muitos QRs válidos recusados.
- Scanner não abre em vários aparelhos.
- Webhook/pagamento com comportamento inconsistente.
- Lentidão generalizada.
- Suspeita de ataque/volume anormal.

## 5. Contingência

| Situação | Sinal Do Problema | Impacto | Ação Imediata | Responsável | Quando Escalar | Plano B |
| --- | --- | --- | --- | --- | --- | --- |
| Z-API fora do ar | Mensagens não chegam ou painel indica falha | Compradores não recebem QR/mensagens | Monitorar painel, registrar casos, evitar reenvios repetidos | Operacional | Falha acima de 5 minutos ou muitos casos | Atendimento manual e reenvio posterior |
| Mercado Pago fora do ar | Checkout falha ou API indisponível | Compra/pagamento afetado | Pausar divulgação ativa, registrar horário | Técnico | Falha persistente ou pagamento duplicado | Aguardar normalização; não emitir manualmente |
| Webhook Mercado Pago atrasado | Pagamento aprovado sem ticket emitido | QR pode atrasar | Aguardar, consultar logs, não alterar banco | Técnico | Atraso recorrente ou muitos compradores | Conferência manual controlada |
| Supabase instável | Erros em admin, compra ou portaria | Sistema pode degradar | Parar ações manuais, registrar rotas afetadas | Técnico | Qualquer erro crítico/500 recorrente | Modo atendimento e suporte presencial |
| Vercel instável | Site/API lento ou indisponível | Compra/portaria afetadas | Confirmar status Vercel e deployment | Técnico | Falha em rotas críticas | Avaliar rollback se for regressão |
| Internet da portaria ruim | Scanner lento ou sem resposta | Entrada fica lenta | Trocar rede, usar backup, reduzir carga local | Operacional | Mais de um aparelho afetado | Triagem manual com suporte |
| Celular perdido/roubado | Aparelho com link de portaria fora de controle | Risco de uso indevido do link | Revogar/pausar acesso e gerar novo link | Operacional/Técnico | Imediatamente | Usar aparelho backup |
| Admin bloqueado | Admin não consegue entrar | Suporte/admin afetado | Acionar Diretor/root para desbloqueio conforme processo | Operacional | Se bloquear responsável principal | Usar backup autorizado |
| WAF falso positivo | Fluxo legítimo recebe bloqueio/429 | Usuários/admin podem ser bloqueados | Registrar rota, horário e IP aproximado se permitido | Técnico | Bloqueio recorrente | Ajuste controlado de regra |
| Ataque/volume anormal | Picos de 429, logs incomuns, lentidão | Risco operacional | Não desativar proteção sem análise; monitorar e registrar | Técnico | Impacto em compra/portaria | Reforçar WAF/rate limit e pausar fluxo afetado |

## 6. Fechamento Pós-Evento

- [ ] Gerar relatório de vendas.
- [ ] Gerar relatório de pagamentos pendentes.
- [ ] Gerar relatório de check-ins.
- [ ] Levantar ingressos usados e não usados.
- [ ] Levantar cortesias emitidas, usadas e canceladas.
- [ ] Levantar reservas expiradas/canceladas.
- [ ] Identificar divergências entre vendas, pagamentos e check-ins.
- [ ] Exportar/guardar evidências redigidas.
- [ ] Registrar problemas encontrados.
- [ ] Registrar decisões tomadas durante contingência.
- [ ] Registrar lições aprendidas.
- [ ] Abrir tarefas de melhoria para problemas recorrentes.

## 7. Matriz De Responsáveis

| Função | Responsável | Telefone | Backup | Acesso Necessário | Horário De Plantão |
| --- | --- | --- | --- | --- | --- |
| Responsável operacional | `<nome>` | `<telefone>` | `<nome/telefone>` | Admin operacional | `<horário>` |
| Responsável técnico | `<nome>` | `<telefone>` | `<nome/telefone>` | Vercel, Supabase, logs | `<horário>` |
| Financeiro/pagamentos | `<nome>` | `<telefone>` | `<nome/telefone>` | Mercado Pago, relatórios | `<horário>` |
| Suporte comprador | `<nome>` | `<telefone>` | `<nome/telefone>` | Admin consultas | `<horário>` |
| Líder de portaria | `<nome>` | `<telefone>` | `<nome/telefone>` | Link de portaria, suporte | `<horário>` |
| Comunicação interna | `<nome>` | `<telefone>` | `<nome/telefone>` | Canal interno | `<horário>` |

## 8. Regras De Segurança Operacional

- Não compartilhar senha individual.
- Não encaminhar link admin.
- Não encaminhar link de portaria fora da equipe.
- Links antigos de portaria devem ser descartados.
- Gerar links novos de portaria no dia do evento.
- Não enviar prints com QR/token em grupo aberto.
- Não consultar dados de cliente sem necessidade operacional.
- Não mexer em banco direto no dia do evento, salvo emergência autorizada.
- Não salvar QR bruto, token bruto, senha, hash ou secret em evidências.
- Não publicar logs com dados reais de comprador.
- Não reduzir WAF/rate limit sem avaliação técnica.

## 9. Evidências Permitidas

Registrar:

- data/hora;
- rota ou fluxo;
- status esperado;
- status real;
- screenshot redigido;
- responsável acionado;
- decisão tomada;
- cleanup, quando aplicável.

Nunca registrar:

- senha;
- token completo;
- QR bruto;
- service role;
- hash completo;
- metadata sensível de pagamento;
- dados reais de cliente sem necessidade.
