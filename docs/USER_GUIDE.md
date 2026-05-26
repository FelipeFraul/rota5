# Guia de Uso do Sistema

Este guia explica como usar a ticketeira pelo WhatsApp, pela portaria e pelos menus administrativos.

## 1. Compra Pelo Cliente

O cliente conversa com o WhatsApp oficial do sistema.

Fluxo básico:

1. O cliente envia o nome do evento, artista, cidade ou data.
2. O sistema lista eventos publicados e disponíveis.
3. O cliente escolhe o evento pelo número.
4. O sistema mostra setores e valores.
5. Se o setor tiver assento marcado, o sistema envia o mapa de assentos.
6. O cliente escolhe assento ou quantidade.
7. O sistema cria uma reserva temporária.
8. O cliente envia `COMPRAR` ou confirma o pagamento.
9. O sistema gera o checkout Mercado Pago.
10. Depois do pagamento aprovado pelo Mercado Pago, o ingresso e o QRCode são enviados por WhatsApp.

Comandos úteis para o cliente:

- `comprar`: gera ou reenvia o link de pagamento da reserva ativa;
- `cancelar`, `cancela`, `apagar`: cancela a reserva pendente e libera o assento;
- `sair`: encerra o fluxo atual.

Observações:

- Reserva não é ingresso.
- O ingresso só é emitido após confirmação real do pagamento.
- Assento reservado expira automaticamente se o pagamento não for concluído no prazo.

## 2. Acesso Administrativo

Administradores entram pelo WhatsApp usando:

```text
admin
```

Depois, o sistema pede a senha individual.

Regras:

- cada administrador tem senha própria;
- não existe senha geral;
- senha digitada não fica salva em texto puro;
- admin desativado não entra;
- admin ativo precisa ter `passphrase_hash` individual no banco.

## 3. Perfis

Perfis disponíveis:

- Diretor: acesso total;
- Gerente: eventos, ingressos/pedidos, cortesias, portaria e relatórios;
- Operador: cortesias e relatórios.

Validador de portaria externo não é administrador. Ele usa acesso próprio de portaria.

## 4. Menu Principal Admin

O menu principal mostra apenas as opções permitidas para o perfil autenticado.

Áreas principais:

- Meus eventos;
- Ingressos e pedidos;
- Cortesias;
- Portaria;
- Administradores;
- Relatórios.

Navegação:

- responder com o número da opção seleciona a opção da tela atual;
- `Voltar` retorna uma tela;
- `Cancelar` abandona o fluxo atual e volta ao menu da área;
- `Sair` encerra a sessão admin.

## 5. Meus Eventos

Use para criar, listar, editar, pausar/ativar e duplicar eventos.

Criação de evento:

1. Entre em `Meus eventos`.
2. Escolha `Criar meu evento`.
3. Informe dados gerais, local, datas, sessões, setores, assentos/unidades e valores.
4. Confira o resumo.
5. Envie `CONFIRMAR`.
6. Escolha rascunho ou publicação.

Regras importantes:

- evento nasce como rascunho e só é publicado depois de todos os dados serem criados;
- evento publicado não deve ficar parcial;
- editar valor afeta somente novas reservas;
- reservas antigas mantêm o valor congelado;
- duplicar evento cria uma cópia em rascunho;
- duplicar não copia pedidos, reservas, pagamentos, tickets, portaria ou cortesias.

## 6. Ingressos E Pedidos

Disponível para Diretor e Gerente.

Funções:

- buscar ingresso por telefone;
- buscar ingresso por código;
- consultar ticket;
- cancelar reserva pendente.

Segurança:

- não mostra token, `qr_token_hash`, metadata de pagamento ou IDs internos sensíveis;
- cancelamento de reserva pendente exige confirmação;
- reserva paga não é cancelada por esse menu;
- ticket pago não é cancelado neste módulo.

## 7. Cortesias

Disponível para Diretor, Gerente e Operador.

Menu:

```text
CORTESIAS

> 1. Gerar cortesia
> 2. Listar cortesias emitidas
> 3. Reenviar cortesia
> 4. Cancelar cortesia
> 5. Voltar
> 6. Sair
```

Gerar cortesia:

1. Escolha evento, sessão e setor.
2. Informe quantidade.
3. Se houver assento marcado, escolha os assentos.
4. Informe telefone do beneficiário.
5. Informe nome e motivo, se quiser.
6. Confira o resumo.
7. Envie `CONFIRMAR`.

Regras:

- cortesia consome disponibilidade real;
- cortesia com assento marcado fica vinculada ao assento;
- cortesia não cria pagamento Mercado Pago;
- QRCode é enviado ao beneficiário;
- reenvio usa o mesmo ticket;
- cortesia usada não deve ser cancelada;
- cortesia cancelada é recusada na portaria.

## 8. Portaria

Use para liberar entrada com QRCode.

Há dois tipos de acesso:

- check-in no telefone do próprio admin autenticado;
- acesso externo por telefone autorizado.

Validador externo:

1. O admin cadastra o telefone para um evento.
2. O sistema gera uma palavra-chave de portaria.
3. O validador envia `Portaria` no WhatsApp.
4. O sistema pede a palavra-chave.
5. Se estiver correta, o sistema envia o link temporário do scanner.

Regras:

- palavra-chave de portaria é armazenada como hash PBKDF2;
- o link é temporário;
- ingresso válido entra uma vez;
- segunda leitura retorna já usado;
- ingresso cancelado é recusado;
- scanner não mostra senha, token ou hash.

## 9. Administradores

Disponível apenas para Diretor.

Menu:

```text
ADMINISTRADORES

> 1. Listar administradores
> 2. Adicionar administrador
> 3. Alterar nível de administrador
> 4. Desativar administrador
> 5. Liberar administrador bloqueado
> 6. Voltar
> 7. Sair
```

Adicionar administrador:

1. Informe telefone.
2. Informe nome.
3. Escolha perfil.
4. Informe senha individual.
5. Confira o resumo.
6. Envie `CONFIRMAR ADMIN`.

Regras:

- não cria admin sem confirmação;
- senha não aparece no resumo;
- senha não é salva em texto puro;
- telefone ativo duplicado não cria novo admin;
- admin desativado pode ser reativado com nova senha;
- não é permitido criar `gate` ou `support`;
- não é permitido desativar ou rebaixar o último Diretor.

### 9.1 Bloqueio por tentativas incorretas

O login administrativo tem limite forte de tentativas:

- 3 tentativas incorretas bloqueiam o telefone por 15 minutos;
- 5 tentativas incorretas sequenciais bloqueiam até liberação manual por Diretor;
- quando houver bloqueio, o Diretor que criou o administrador recebe alerta;
- quando a origem/IP estiver disponível no webhook, o sistema guarda apenas um hash da origem, nunca o IP puro.

Para liberar:

1. Entre em `Administradores`.
2. Escolha `Liberar administrador bloqueado`.
3. Escolha o número/telefone listado.
4. Confirme com `LIBERAR ADMIN`.

Liberar o administrador zera as tentativas e remove bloqueios temporários ou manuais.

## 10. Relatórios

Disponível para Diretor, Gerente e Operador.

Menu:

```text
RELATÓRIOS

> 1. Resumo geral
> 2. Vendas por evento
> 3. Vendas por setor
> 4. Pagamentos pendentes
> 5. Reservas expiradas/canceladas
> 6. Check-ins da portaria
> 7. Ingressos usados e não usados
> 8. Cortesias
> 9. Voltar
> 10. Sair
```

Períodos:

- hoje;
- últimos 7 dias;
- últimos 30 dias;
- todo o período;
- intervalo personalizado simples.

Segurança:

- relatórios são somente leitura;
- não alteram pedidos, pagamentos, reservas, tickets ou assentos;
- telefones aparecem mascarados;
- não mostram token, `qr_token_hash`, metadata ou IDs internos sensíveis.

## 11. Produção E Operação

Antes de uso real amplo:

1. Validar um pagamento real controlado de baixo valor.
2. Validar recebimento do ingresso e QRCode por WhatsApp.
3. Validar leitura do QRCode na portaria.
4. Confirmar que cron de expiração está sendo chamado.
5. Confirmar que webhooks sem segredo retornam `401`.

Endpoints protegidos:

- `/api/webhook/zapi`;
- `/api/webhook/payment/mercado-pago`;
- `/api/checkout/mercado-pago`;
- `/api/cron/expire-reservations`.

## 12. Limitações Atuais

Ainda não fazem parte do sistema final:

- estorno automático;
- troca de ingresso;
- cancelamento de ticket pago comprado;
- reenvio manual de ingresso pago pelo admin;
- exportação externa de relatórios;
- PDF visual do ingresso.

## 13. Boas Práticas

- Não compartilhar senha individual de administrador.
- Não cadastrar telefone de portaria como administrador.
- Usar perfis mínimos necessários.
- Testar eventos novos como rascunho antes de publicar.
- Não gerar cortesia em produção sem conferência do evento, sessão e assento.
- Validar a portaria antes de abrir os portões.
- Conferir relatórios depois de eventos reais para reconciliar operação.
