# Visão Geral do Sistema

Atualizado em 26/05/2026.

Este documento resume o que existe hoje no sistema, como os fluxos funcionam e quais pontos ainda precisam de decisão ou refinamento.

## 1. Objetivo

O sistema é uma ticketeira com atendimento principal pelo WhatsApp.

Ele permite:

- buscar eventos;
- comprar ingressos;
- reservar assentos;
- pagar por Mercado Pago;
- receber ingresso/QRCode pelo WhatsApp;
- validar ingresso na portaria;
- administrar eventos pelo WhatsApp;
- gerar e controlar cortesias;
- cadastrar acessos de portaria;
- consultar ingressos, reservas e relatórios.

## 2. Tecnologias

- Next.js App Router;
- TypeScript;
- Supabase;
- Mercado Pago;
- Z-API para WhatsApp;
- Vercel em produção.
- Rate limit server-side com Supabase para rotas públicas e sensíveis.

URL principal de produção:

```text
https://site-phi-seven-72.vercel.app
```

## Segurança de Borda e Rate Limit

Rotas públicas e sensíveis têm proteção por janela curta no app:

- webhooks Z-API e Mercado Pago;
- checkout Mercado Pago;
- portaria (`scan` e validação de sessão);
- páginas públicas de ingresso e portaria;
- cron de expiração de reservas.

O contador fica em `rate_limit_events` por rota e hash SHA-256 da origem. O sistema não salva IP puro, payload bruto, telefone completo, token, QR/base64 ou metadata sensível.

Além disso, a Vercel tem uma regra única publicada no Firewall, `Rate limit - Sensitive public routes`, para as rotas sensíveis. Ela usa Fixed Window de 60 segundos, 120 requests, chave IP Address e ação `429`. A configuração está documentada em `docs/VERCEL_FIREWALL.md`.

## 3. Compra pelo WhatsApp

### 3.1 Busca de eventos

O comprador pode buscar por:

- nome do evento;
- artista;
- cidade;
- local;
- data escrita em texto, como `8 de agosto`;
- data numérica;
- mês;
- termos próximos.

O sistema mostra apenas eventos publicados, futuros e com sessão vendável.

### 3.2 Anúncio do evento

O anúncio mostra:

- título do evento em caixa alta;
- artista;
- cidade/estado;
- data/hora;
- local;
- status de venda;
- opções para comprar, saber mais ou buscar outro evento.

Regra visual:

- o título do evento deve aparecer em caixa alta;
- demais informações devem evitar caixa alta excessiva e usar capitalização natural.

### 3.3 Escolha de ingresso

O sistema lista ofertas de compra, não apenas o setor.

Exemplo:

```text
ESCOLHA SEU INGRESSO/SETOR
> 1. Assentos - Meia - R$ 60,00
> 2. Assentos - Inteira - R$ 120,00

Responda com o número do setor para continuar.
```

Taxa só deve aparecer quando existir valor de taxa maior que zero.

### 3.4 Quantidade

Depois que o comprador escolhe o ingresso, o sistema pergunta a quantidade.

Para setor sem assento marcado:

- o comprador informa a quantidade;
- o sistema reserva automaticamente a quantidade disponível.

Para setor com assento marcado:

- o comprador informa a quantidade;
- recebe o mapa de assentos atualizado;
- responde com os códigos dos assentos desejados.

### 3.5 Mapa de assentos

O mapa é enviado como imagem PNG pelo WhatsApp.

Cores:

- verde: assento livre;
- cinza: assento ocupado/indisponível.

Todos os assentos devem mostrar letra e número.

O mapa usa posições cadastradas no evento. Quando não houver posições, o sistema usa um fallback automático por fileira e número do assento. Quando houver palco, o mapa mostra apenas o texto `PALCO`, sem fundo cinza.

Quando uma compra é feita, a próxima visualização do mapa deve refletir o assento já ocupado.

O envio real/controlado do mapa pelo WhatsApp foi validado com Z-API em produção: o sistema gerou a imagem, a Z-API aceitou o envio para o número controlado e um segundo mapa refletiu assento reservado como indisponível.

Se o comprador informar assento inexistente, ocupado ou fora da lista enviada, a resposta deve ser:

```text
ASSENTO INDISPONÍVEL
```

### 3.6 Reserva

A reserva bloqueia temporariamente os ingressos/assentos.

Mensagem atual desejada:

```text
RESERVA CRIADA. VOCÊ TEM 10 MINUTOS PARA EFETUAR A COMPRA
> Evento: ...
> Setor: ...
> Quantidade: ...

Valor: R$ ...
> Reserva válida até: ...

Para comprar, digite COMPRAR. Você receberá o link de pagamento na próxima mensagem.
```

Se a reserva expirar, os ingressos voltam à venda e o comprador deve receber:

```text
⏰ A SUA RESERVA EXPIROU
Os ingressos foram liberados novamente para venda.
Para ver o mesmo evento ou buscar outro, só digitar uma nova busca.
```

Quando a reserva expira ou quando o usuário digita comandos como `cancelar`, `cancela`, `apagar` ou `sair`, o processo precisa ser zerado para a conversa poder começar de novo.

Expiração operacional:

- reservas expiradas são processadas pela RPC `public.expire_reservations`;
- existe endpoint protegido `GET` ou `POST /api/cron/expire-reservations`, exigindo `Authorization: Bearer CRON_SECRET`;
- em produção, se o plano Vercel não permitir cron em frequência de minuto, um agendador externo deve chamar o endpoint;
- a expiração libera apenas assentos ainda reservados pela própria reserva e não altera ingressos pagos, vendidos ou bloqueados.

Cancelamento pelo comprador:

- `cancelar`, `cancela`, `apagar` e `sair` zeram o fluxo de compra;
- se houver reserva ativa e pedido pendente, o sistema cancela a reserva, cancela o pedido pendente e libera os assentos/ingressos pela RPC transacional `public.cancel_pending_reservation`;
- reservas/pedidos pagos não são cancelados por esse comando.
- a RPC foi aplicada e validada no Supabase real; `anon` e `authenticated` não executam, somente `service_role`.

Mensagem quando havia reserva ativa cancelada:

```text
PROCESSO CANCELADO
Sua reserva foi cancelada e os ingressos foram liberados.
Para começar de novo, envie o nome do evento, artista, cidade ou data.
```

Mensagem quando não havia reserva ativa:

```text
PROCESSO CANCELADO
Para começar de novo, envie o nome do evento, artista, cidade ou data.
```

### 3.7 Pagamento

O pagamento é feito via Mercado Pago.

O comprador recebe link de checkout.

Mensagem desejada:

```text
LINK DE PAGAMENTO GERADO
> Evento: ...
> Setor: ...
> Total: R$ ...

Pague clicando neste link (crédito ou pix):
https://...

Após a confirmação do pagamento, seu ingresso será emitido automaticamente.
```

### 3.8 Emissão do ingresso

Após a confirmação do Mercado Pago:

- o pedido é marcado como pago;
- a reserva é marcada como paga;
- os assentos ficam vendidos;
- os tickets são emitidos;
- o comprador recebe o ingresso pelo WhatsApp.

A mensagem de confirmação deve separar:

1. dados do ingresso;
2. imagem do QRCode na última mensagem.

O comprador não deve receber apenas link; deve receber a imagem do QRCode.

O QRCode é gerado no momento do envio a partir da URL assinada do ingresso. O sistema não salva o token bruto nem a imagem do QRCode no banco. Quando um pedido tiver mais de um ingresso, cada ingresso recebe seu próprio QRCode em mensagem separada. Se a imagem do QRCode falhar depois do pagamento aprovado, o pagamento e o ingresso não são desfeitos; o reenvio manual fica para outro fluxo.

O sistema gera o QRCode como PNG antes de enviar para a Z-API. Em teste operacional real/controlado, o comprador recebeu a imagem do QRCode pelo WhatsApp. O aplicativo pode exibir ou baixar a imagem como JPG depois do envio, o que é aceitável desde que o QRCode continue legível e validável.

Mensagem de QRCode:

```text
APRESENTE O QRCODE NA PORTARIA
Este ingresso será validado uma única vez na portaria. Por segurança, não envie para terceiros.
```

## 4. Validação na portaria

### 4.1 Link de check-in

A portaria acessa uma página com câmera.

O link pode ser gerado:

- para o próprio telefone do admin;
- para outro telefone definido como validador.

O validador não precisa ser administrador do sistema.

No fluxo `Check-in neste telefone`, o admin autenticado escolhe o evento antes de receber o link. O sistema cria uma `gate_session` temporária vinculada ao `event_id` escolhido para o próprio telefone do admin. O link é assinado, temporário e não mostra palavra-chave.

### 4.2 Cadastro de outro telefone para check-in

Fluxo desejado:

1. escolher o evento;
2. informar telefone;
3. informar palavra-chave/senha;
4. sistema cadastra o acesso.

Mensagem final:

```text
NOVO TELEFONE CADASTRADO PARA CHECK-IN

> Telefone: [numero]
> Palavra chave: [palavra]

O telefone cadastrado deve enviar uma mensagem com a palavra Portaria para o telefone 15 99642-6671
```

Se tentar cadastrar o mesmo telefone novamente para o mesmo evento/acesso ativo ou pausado, deve responder que o telefone já está cadastrado.

O cadastro do validador fica em `gate_accesses`, separado das sessões temporárias de leitura. A palavra-chave é mostrada ao admin apenas na mensagem final de cadastro, mas no banco é salva somente como hash PBKDF2. Mensagens recebidas contendo palavra-chave de portaria são redigidas no histórico como `[GATE_ACCESS_REDACTED]`. Quando o telefone cadastrado envia `Portaria`, o sistema pede a palavra-chave; se houver mais de um acesso ativo, lista os eventos antes de pedir a palavra-chave; se estiver correta, gera uma nova `gate_session` temporária para o evento cadastrado. Acesso pausado não gera link.

### 4.3 Scanner

Quando o QRCode é lido:

- primeira leitura válida libera o acesso;
- leituras seguintes do mesmo QRCode são negadas como já utilizado.

Para evitar várias leituras instantâneas, a página pausa a leitura após resposta `allowed = true`, mostra acesso liberado por alguns segundos e depois retoma a leitura. Leituras recusadas também passam por cooldown curto para evitar loop de leitura.

### 4.4 Página da portaria

Na página de check-in:

- abaixo de `Portaria` deve aparecer o nome do evento;
- se houver sessão vinculada, deve aparecer data/hora da sessão;
- não deve aparecer a palavra-chave.
- não deve aparecer telefone completo, token, `token_hash`, hash de palavra-chave ou dados internos de admin.

## 5. Área admin pelo WhatsApp

O admin entra pelo WhatsApp com palavra-chave.

Os menus devem aparecer de acordo com o perfil do administrador.

Perfis atuais em português, com valores internos estáveis no banco:

- Diretor (`root`): acesso total ao sistema;
- Gerente (`admin`): gerencia eventos, ingressos, cortesias, portaria e relatórios; não gerencia administradores;
- Operador (`operator`): gerencia cortesias e relatórios.

O perfil `porteiro/gate` não existe mais como administrador. Porteiro é apenas um telefone cadastrado em `Portaria` pela tabela `gate_accesses`.

### 5.1 Menu principal admin

Menu geral:

```text
MENU ADMIN

> 1. Meus eventos
> 2. Ingressos e pedidos
> 3. Cortesias
> 4. Portaria
> 5. Administradores
> 6. Relatórios
> 7. Sair
```

Cada perfil deve ver apenas os menus permitidos.

O número exibido é sempre o número aceito. Quando um perfil não tem acesso a uma área, a área não aparece no menu, mas os números das áreas permitidas permanecem os números oficiais do menu principal.

### 5.2 Navegação

Regra importante:

- `Voltar` deve voltar uma única tela;
- `Cancelar` abandona a tela/fluxo atual;
- `Sair` sai da área admin;
- números devem funcionar para `Voltar` e `Sair` quando aparecem no menu;
- textos também devem funcionar.
- números são interpretados apenas pela tela atual;
- para trocar de área a partir de um submenu, o admin deve digitar o nome da área.

O caminho de volta deve ser igual ao caminho de ida. Exemplo: se o admin entrou em `Editar valores`, depois listou preços ou alterou valor, `Voltar` deve retornar para `VALORES DE VENDA`, não para detalhe do evento ou lista de eventos.

Comandos de troca de área:

- `evento`, `eventos` ou `meus eventos`;
- `ingresso`, `ingressos`, `pedido` ou `pedidos`;
- `cortesia` ou `cortesias`;
- `portaria`, `check-in` ou `checkin`;
- `administrador` ou `administradores`;
- `relatorio`, `relatório`, `relatorios` ou `relatórios`.

Se o perfil não tiver permissão para a área, a resposta é:

```text
Essa opção não está disponível para o seu nível de acesso.
```

`Cancelar` abandona o fluxo atual sem encerrar a sessão admin. `Sair`, `logout`, `encerrar` ou o número de `Sair` exibido na tela encerram a sessão com segurança.

Auditoria operacional:

- a navegação admin foi validada com Supabase real, Z-API mockada e prefixo `TEST_ADMIN_NAVIGATION_FLOW`;
- a auditoria confirmou menu por perfil, número local à tela atual, troca por palavra com permissão, `Voltar` em fluxos profundos de eventos/valores/portaria, `Cancelar` sem encerrar sessão, `Sair` por texto e por número, bloqueio de sessão expirada, cliente comum sem impacto e cleanup completo.

## 6. Meus eventos

Menu atual desejado:

```text
MEUS EVENTOS
> 1. Listar meus eventos
> 2. Criar meu evento
> 3. Editar meu evento
> 4. Ativar/Pausar meu evento
> 5. Duplicar evento
> 6. Voltar
> 7. Sair
```

O item `Setores e assentos` foi removido do menu principal de eventos. Setores e assentos entram dentro da criação/edição do evento.

### 6.1 Listar meus eventos

Submenu:

```text
LISTAR MEUS EVENTOS
> 1. Eventos ativos
> 2. Eventos pausados
> 3. Eventos cancelados
> 4. Todos os eventos
> 5. Voltar
> 6. Sair
```

Layout de lista:

```text
EVENTOS ENCONTRADOS:
1. Nome do evento
   Cidade/UF
   Status: ...
   Sessões: ...
   Próxima: ...
---
2. Nome do evento
...

Responda com o
> Digite o número do evento para detalhes
> Digite "Mais" para ver mais eventos

Digite "Voltar" para voltar, "Cancelar" para abandonar esta tela ou "Sair" para sair da área de admin.
```

### 6.2 Criar evento

Fluxo de criação coleta:

- nome;
- artista;
- cidade;
- estado;
- local;
- foto;
- quantidade de sessões/datas;
- datas e horários;
- modelo de entrada/lugares;
- carga de ingressos;
- tipos de ingresso/ofertas;
- setores/assentos, quando houver;
- informações gerais;
- confirmação final;
- escolha entre rascunho ou publicação.

Ao terminar a edição/criação, o sistema deve mostrar o resumo, pedir `CONFIRMAR` ou `CANCELAR` e, depois da confirmação, perguntar se o admin quer deixar como rascunho ou publicar. O evento só é gravado depois dessa escolha final. Mesmo quando o admin escolhe publicar, a gravação começa internamente como `draft`, cria sessões, setores, assentos/unidades e preços, e só depois promove o evento para `published` e as sessões para vendáveis.

### 6.3 Sessões/datas

O sistema precisa diferenciar:

- quantidade de datas;
- quantidade de sessões por data.

Exemplo:

- 1 sessão;
- 3 datas.

Isso deve ser interpretado como 3 sessões no total, uma por data, e não como “sessão 1 de 13”.

Quando houver 2 ou 3 sessões no mesmo dia, o sistema precisa criar horários distintos para a mesma data.

### 6.4 Entradas/lugares

Pergunta:

```text
Como serão as entradas/lugares?
1. Entrada única sem assento marcado
2. Vários setores/tipos sem assento marcado
3. Setores com assentos marcados
```

### 6.5 Carga de ingressos

Todo evento tem carga, mas existem dois modelos:

```text
Como a carga de ingressos será controlada?

> 1. Carga total compartilhada entre todos os tipos de compra
> 2. Carga separada para cada tipo/setor
```

Modelo 1:

- existe uma carga total do evento/setor;
- qualquer tipo de ingresso pode consumir essa carga;
- exemplo: 1000 ingressos totais, com tipos `inteira`, `meia`, `promocional`.

Modelo 2:

- cada tipo/setor tem sua própria capacidade;
- exemplo: inteira 500, meia 300, promocional 200.

### 6.6 Tipos de ingresso

O sistema deve aceitar formatos simples:

```text
Inteira 100 120,00
Inteira, 100, 120,00
Inteira - 100 - 120,00
Inteira | 100 | 120,00
```

Quando o modelo for carga total compartilhada, o cadastro do tipo de ingresso não deve exigir capacidade por tipo.

### 6.7 Assentos marcados

Por enquanto, a criação do mapa é digitada.

Formatos aceitos/planejados:

```text
A 10 ASSENTOS DE 10 A 1 - 3 X ESQUERDA
B 13 ASSENTOS DE 13 A 1 - 1 X ESQUERDA
C 13 ASSENTOS DE 13 A 1 - 1 X ESQUERDA
```

Também deve aceitar desenho textual:

```text
A: ____ 1 2 3 4 5 6 7 8 9 10
B: __ 1 2 3 4 5 6 7 8 9 10 11 12 13
C: __ 1 2 3 4 5 6 7 8 9 10 11 12 13
D: 1 2 _ 4 5 6 7 8 9 10 11 12 13 14 15
N: 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20
```

Regras:

- `_` representa lacuna;
- espaços antes dos números deslocam a fileira;
- `X ESQUERDA` deve ser opcional;
- quando não informado, a fileira começa do padrão natural.

O desenho gerado ainda precisa ser refinado para ficar visualmente mais próximo dos mapas reais de teatro.

Status operacional:

- o menu `MEUS EVENTOS` usa a numeração oficial e não mostra mais `Setores e assentos` como item principal;
- `Listar meus eventos` filtra ativos, pausados, cancelados e todos, com até 5 eventos por página e comando `Mais`;
- a criação guiada coleta foto, quantidade de datas, quantidade de sessões por data, cada data e seus horários separados, modelo de entrada, carga, tipos/ofertas, assentos digitados quando houver, informações gerais, confirmação final e depois escolha entre rascunho/publicação;
- `3 datas` com `1 sessão por data` cria 3 sessões; `1 data` com `2 sessões por data` cria 2 sessões no mesmo dia com horários distintos;
- eventos só são gravados depois de `CONFIRMAR` e da escolha final de rascunho/publicação; ao cancelar antes disso, o rascunho da conversa é descartado e nenhum evento temporário é criado;
- para evitar publicação parcial, a criação persiste primeiro como `draft` e só promove para `published` depois que sessões, setores, assentos/unidades e preços foram criados com sucesso;
- publicação exige foto; rascunho pode seguir sem foto.

### 6.8 Editar evento

Menu desejado:

```text
EDITAR MEU EVENTO
> 1. Editar nome
> 2. Editar artista
> 3. Editar cidade
> 4. Editar estado
> 5. Editar local
> 6. Editar foto
> 7. Editar data/hora
> 8. Editar setores/lugares
> 9. Editar carga
> 10. Editar valores
> 11. Editar informações gerais
> 12. Voltar
> 13. Sair
```

A edição de campos simples pede novo valor, mostra resumo e só grava depois de `CONFIRMAR`. Isso vale para nome, artista, cidade, estado, local, foto e informações gerais. A foto pode ser atualizada por URL ou removida; informações gerais ficam em `description` e podem ficar vazias.

Editar data/hora lista as sessões do evento, pede a nova data/hora e exige confirmação. Datas passadas são bloqueadas. Se a sessão já tiver reserva, pedido ou ingresso, o sistema não altera a sessão automaticamente e responde com mensagem segura.

Editar setores/lugares permite alterar nome, capacidade e status com confirmação. Não há exclusão física. Assentos vendidos ou reservados não são apagados nem alterados para disponível.

Editar carga vale para setores sem assento marcado: aumentar cria novas unidades disponíveis; reduzir só bloqueia unidades ainda disponíveis. Se a nova carga for menor que o total já vendido ou reservado, a resposta é:

```text
Não é possível reduzir para esse valor porque já existem ingressos vendidos ou reservados.
```

### 6.9 Editar valores

Menu:

```text
VALORES DE VENDA - NOME DO EVENTO

> 1. Listar preços
> 2. Criar preço/lote
> 3. Editar preço/lote
> 4. Ativar/desativar preço
> 5. Voltar
> 6. Sair
```

Para editar valor, o fluxo deve ser simples:

```text
Preços de Casô cabô:

1. Inteira
2. Meia

QUAL PREÇO DESEJA EDITAR?
Responda com o número do preço.
```

Depois:

```text
NOVO VALOR - INTEIRA

Digite somente o novo valor.
Ex: 140,00
```

Ao digitar o valor, o sistema pede confirmação curta antes de gravar.

Se houver mais informações além do valor, elas devem ser separadas em outro fluxo. Não deve exigir que o admin envie label, preço, taxa, início e fim tudo junto. A edição simples altera somente `price_cents`; taxa, rótulo e janela de venda permanecem iguais. Reservas antigas continuam com preço congelado em `reservation_items`.

Criar preço/lote continua criando ofertas ativas em BRL com sessão, setor, tipo, rótulo, valor, taxa e janela opcional. Como o sistema permite múltiplas ofertas do mesmo tipo no mesmo setor, a duplicidade bloqueada é de rótulo no mesmo par sessão/setor.

### 6.10 Duplicar evento

Existe a necessidade de duplicar um evento.

Fluxo desejado:

- admin escolhe o evento;
- sistema mostra um resumo e pede confirmação;
- sistema duplica dados principais, local, sessões, setores, assentos, unidades de disponibilidade e preços;
- o duplicado nasce como rascunho com nome no formato `NOME DO EVENTO - CÓPIA`;
- em seguida joga o admin para a tela de edição do evento duplicado;
- admin altera o necessário e publica.

A duplicação não copia reservas, pedidos, pagamentos, tickets, validações, acessos de portaria, sessões de portaria, cortesias ou dados financeiros.

## 7. Ingressos e pedidos

Menu:

```text
INGRESSOS E PEDIDOS

> 1. Buscar ingresso por telefone
> 2. Buscar ingresso por código
> 3. Cancelar reserva pendente
> 4. Consultar ticket
> 5. Voltar
> 6. Sair
```

### 7.1 Busca por telefone

Deve mostrar:

- ingressos encontrados;
- reservas pendentes;
- forma de pagamento;
- data/hora da compra;
- status;
- validação, quando houver.

Layout simplificado desejado:

```text
BUSCA POR TELEFONE

Telefone: ...

INGRESSOS:
1. NOME DO EVENTO
   Data: ...
   Setor: ...
   Código: ...
   Compra: ...
   Pagamento: Mercado Pago - aprovado
   Total: R$ ...
   Status: usado
   Validado em: ...
---

RESERVAS PENDENTES:
Nenhuma reserva pendente encontrada.
```

Informações excessivas como local, telefone repetido e assento podem ser omitidas quando não forem necessárias.

### 7.2 Busca por código

Busca o ingresso por `ticket_code` e mostra evento, data/hora, setor, código, comprador mascarado quando houver, status, pagamento resumido e validação quando existir.

Não deve mostrar `qr_token_hash`, token assinado, metadados de pagamento, `payment_id` ou ids internos de pedido/reserva.

### 7.3 Cancelar reserva pendente

O cancelamento administrativo de reserva pendente:

- aceita telefone do comprador, id da reserva ou id do pedido;
- quando recebe telefone, lista reservas pendentes e pede o número da reserva;
- mostra resumo e exige a confirmação exata `CANCELAR RESERVA`;
- chama somente a RPC transacional `public.cancel_pending_reservation`;
- cancela apenas reserva ativa com pedido `draft` ou `pending_payment`;
- libera os assentos/unidades reservados;
- não cancela pedido pago, reserva paga, ticket emitido ou pagamento.

Mensagem de sucesso:

```text
RESERVA CANCELADA
Os ingressos foram liberados para venda novamente.
```

### 7.4 Consultar ticket

Mostra detalhes operacionais seguros do ticket: evento, sessão, setor, assento quando houver, comprador mascarado, status, pagamento resumido e últimas tentativas/validações de portaria. Neste ponto a consulta não altera ticket, pagamento, pedido ou reserva.

Limitações deste ponto:

- sem estorno;
- sem cancelamento de ticket pago;
- sem reenvio manual de ingresso.

## 8. Cortesias

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

### 8.1 Conceito

Cortesia é um ingresso emitido pelo administrador.

Regras importantes:

- a cortesia consome disponibilidade real do setor/assento;
- cortesia com assento marcado deixa o assento indisponível;
- cortesia não cria pagamento Mercado Pago;
- cortesia emitida valida na portaria como ingresso normal;
- cortesia cancelada é recusada na portaria;
- o QRCode é enviado como imagem ao beneficiário pelo WhatsApp;
- o reenvio usa o mesmo ticket, sem criar novo ingresso.

### 8.2 Gerar cortesia

Fluxo:

- escolher evento;
- escolher sessão;
- escolher setor/oferta;
- informar quantidade;
- para assento marcado, receber mapa e informar códigos;
- informar telefone do beneficiário;
- informar nome e motivo, opcionais;
- confirmar;
- sistema emite ticket gratuito, consome disponibilidade e envia o QRCode ao beneficiário.

Mensagem de sucesso:

```text
CORTESIA GERADA

> Evento: ...
> Beneficiário: ...
> Telefone: ****3836
> Quantidade: ...
> Código(s): ...

O ingresso foi enviado ao beneficiário pelo WhatsApp.
```

Mensagem ao beneficiário:

```text
VOCÊ RECEBEU UMA CORTESIA

> Evento: ...
> Data: ...
> Setor: ...
> Código: ...

Apresente o QRCode na portaria.
```

### 8.3 Listar e reenviar

Listar cortesias pede o evento e mostra beneficiário, telefone mascarado, código, setor/assento, status, uso e data de emissão. Não mostra token, `qr_token_hash`, metadados crus ou ids internos sensíveis.

Reenviar cortesia pede telefone ou código, lista os resultados quando houver mais de um, exige confirmação e reenvia o mesmo ticket/QRCode. Não cria novo ticket e não altera disponibilidade. Cortesias canceladas ou usadas não são reenviadas.

### 8.4 Cancelar cortesia

Cancelar cortesia pede telefone ou código, lista os resultados, exige confirmação forte:

```text
CANCELAR CORTESIA
```

Depois marca o ticket como `cancelled`, marca a cortesia como `cancelled`, mantém histórico e libera a disponibilidade quando a cortesia ainda não foi usada. Cortesia usada não é cancelada neste fluxo.

Implementação operacional: a emissão usa a RPC `public.issue_courtesy_order`, que fecha uma reserva gratuita sem criar linha em `payments`. A RPC deve estar aplicada no Supabase real antes dos testes finais do Ponto 10.

## 9. Portaria

Menu:

```text
PORTARIA

> 1. Check-in neste telefone
> 2. Definir outro telefone para check-in
> 3. Ver todos os acessos
> 4. Revogar acessos
> 6. Voltar
> 7. Sair
```

### 9.1 Ver acessos

Antes de mostrar acessos, deve perguntar o evento.

Depois:

```text
VER TODOS OS ACESSOS

> 1. Ativos
> 2. Pausados
> 3. Voltar
> 4. Sair
```

### 9.2 Revogar acessos

Deve mostrar lista e pedir o número do acesso que deseja pausar.

Revogar deve pausar o acesso, não apagar.

## 10. Administradores

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

O item `Limites de cortesias` não deve ficar em Administradores, porque o limite é do evento.

### 10.1 Adicionar administrador

Fluxo atual:

- informar telefone;
- informar nome ou pular;
- escolher nível de acesso;
- informar palavra-chave individual;
- confirmar com `CONFIRMAR ADMIN`.

Níveis:

```text
QUAL NÍVEL DE ACESSO?
> 1. Diretor
> 2. Gerente
> 3. Operador
```

Mensagem final:

```text
ADMINISTRADOR ADICIONADO
> Nome: ...
> Telefone: ****3836
> Perfil: Gerente
```

O sistema pede uma palavra-chave individual no cadastro e salva apenas o hash PBKDF2 em `admin_users.passphrase_hash`. A palavra-chave não aparece na confirmação, não é salva em texto puro no histórico de mensagens e o contexto temporário guarda apenas o hash pendente até a confirmação. O novo administrador entra enviando `admin` e depois a própria palavra-chave. Não existe senha geral nem fallback por variável de ambiente; administrador ativo sem `passphrase_hash` não autentica e a constraint `admin_users_active_requires_passphrase_hash` impede manter ou ativar admin sem hash individual. Admin desativado pode ficar sem hash, mas precisa receber uma nova palavra-chave para voltar a ficar ativo. Se o telefone já existir ativo, não cria duplicado. Se existir desativado, o fluxo pode reativar com confirmação `REATIVAR ADMIN` e define uma nova palavra-chave.

O login administrativo também aplica limite forte de tentativas. Três senhas incorretas bloqueiam o telefone por 15 minutos; cinco tentativas incorretas sequenciais bloqueiam até liberação manual por Diretor. Quando a origem/IP estiver disponível, o sistema guarda apenas hash da origem em `admin_auth_attempts.last_source_hash`. O Diretor que cadastrou o administrador recebe alerta quando o bloqueio é acionado. A liberação fica em `Administradores > Liberar administrador bloqueado` e exige confirmação `LIBERAR ADMIN`.

### 10.2 Alterar nível

Fluxo:

- escolher administrador;
- escolher novo nível;
- confirmar com `ALTERAR NÍVEL`.

Regras:

- apenas Diretor pode alterar;
- não permite `gate`/`support`;
- não permite auto-rebaixamento de Diretor;
- revoga sessões ativas do administrador alterado para aplicar novas permissões.

### 10.3 Desativar administrador

Fluxo:

- escolher administrador ativo;
- confirmar com `DESATIVAR ADMIN`.

Mensagem final:

```text
ADMINISTRADOR DESATIVADO
> Nome: ...
> Telefone: ****3836
> Perfil: Gerente
```

Regras:

- não apaga `admin_users`;
- não desativa o próprio Diretor neste ponto;
- não remove o último Diretor ativo;
- revoga sessões ativas do administrador desativado;
- não altera `ADMIN_ROOT_WHATSAPP_PHONES`.

## 11. Relatórios

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

Relatórios são somente leitura, disponíveis para Diretor, Gerente e Operador. Cliente comum, validador externo de portaria e admin desativado não acessam. O período padrão recomendado é `Últimos 30 dias`; a tela também permite hoje, últimos 7 dias, todo o período e intervalo personalizado simples.

Nenhum relatório expõe `payment_id`, metadata de pagamento, `qr_token_hash`, token, IDs internos brutos ou telefone completo. Telefones aparecem mascarados.

### 11.1 Vendas por setor

Layout:

```text
VENDAS POR SETOR
> Evento: BEEF TOUR 10 ANOS
> Local: Bancários - Itapetininga/SP
> Período: Últimos 7 dias
1. Meia entrada solidária - casal
> Vendidos: 1
> Cortesias: 2
> Emitidos: 3
> Usados: 0
> Receita: R$ 1,00
```

Definições:

- Pagos emitidos: ingressos pagos;
- Cortesias emitidas: ingressos gratuitos/cortesia;
- Disponíveis restantes: unidades/assentos ainda disponíveis em `session_seats`;
- Usados: ingressos validados na portaria;
- Valor vendido: soma dos ingressos pagos, sem cortesias.

### 11.2 Check-ins da portaria

Layout:

```text
CHECK-INS DA PORTARIA
Evento: BEEF TOUR 10 ANOS
> Período: Todo o período
> Entradas liberadas: 1
> Leituras negadas: 2
1. TCK-...
> Horário: ...
> Validador: ...
```

O relatório resume `allowed`, recusados e `already_used`, e mostra últimas validações sem token ou telefone completo do validador.

### 11.3 Ingressos usados e não usados

Layout:

```text
INGRESSOS USADOS E NÃO USADOS
Evento: BEEF TOUR 10 ANOS
> Período: Todo o período
> Emitidos: X
> Não usados: X
> Usados: X
> Cancelados: X
> Comparecimento: X%
```

Definições:

- Emitidos: tickets emitidos e não cancelados;
- Não usados: emitidos menos usados;
- Usados: tickets validados;
- Cancelados: tickets cancelados;
- Comparecimento: usados / emitidos, arredondado.

### 11.4 Resumo geral

Mostra vendas pagas, pedidos pagos, ingressos emitidos, cortesias emitidas, reservas ativas, reservas expiradas, reservas canceladas, check-ins realizados e ingressos não usados.

### 11.5 Pagamentos pendentes

Lista reservas ativas com pedido `pending_payment`, telefone mascarado, quantidade, total, expiração e status. Não mostra checkout URL completa nem identificadores do provedor.

### 11.6 Reservas expiradas/canceladas

Lista reservas com status `expired` ou `cancelled`, telefone mascarado, quantidade, valor, status e data de atualização. Quando não houver timestamp específico de cancelamento, usa `updated_at`.

### 11.7 Cortesias

Mostra cortesias emitidas, usadas, não usadas e canceladas, além dos últimos beneficiários com telefone mascarado e motivo/observação quando houver.

## 12. Regras de segurança e consistência

- Pagamento só é confirmado pelo webhook do Mercado Pago.
- O sistema não deve marcar pedido como pago manualmente fora da confirmação segura.
- Reserva usa RPC transacional no Supabase.
- Validação de portaria usa RPC transacional e bloqueia reuso.
- QRCode/token bruto não deve ser armazenado em texto puro.
- Admin por WhatsApp deve exigir sessão autenticada.
- Senha/palavra-chave de admin deve ser individual e armazenada apenas como hash PBKDF2 em `admin_users.passphrase_hash`.
- Não existe senha geral administrativa nem fallback por `ADMIN_AUTH_SECRET_HASH`.
- Admin ativo sem `passphrase_hash` é bloqueado pela aplicação e pela constraint `admin_users_active_requires_passphrase_hash`.
- Mensagens sensíveis não devem gravar senha em texto.
- Diretor/root pode ver tudo; Gerente e Operador seguem permissões por módulo.

## 13. Pontos ainda frágeis ou a revisar

- Executar um pagamento real controlado de baixo valor antes de operação pública ampla.
- Implementar reenvio manual de ingresso pago.
- Implementar cancelamento/troca/estorno com regras explícitas.
- Implementar filtro `wrong_event` para portaria quando a validação precisar ser restrita a evento/sessão.
- Implementar exportação de relatórios fora do WhatsApp, se necessário.
- Refinar mapas de assento para plantas complexas com lacunas e deslocamentos.
- Evoluir QR/PDF visual sem salvar token puro, base64 ou segredo.

## 14. Auditoria de fechamento

O Ponto 13 usa `.tools/audit_system_closure.mjs` com o prefixo `TEST_SYSTEM_CLOSURE` para validar a base de segurança:

- somente `.env.example` é versionado;
- `.env.example` não contém segredo real;
- `SUPABASE_SERVICE_ROLE_KEY` aparece apenas em código server-side;
- `ADMIN_AUTH_SECRET_HASH` não existe no runtime nem no exemplo de env;
- admin ativo sem senha individual é recusado pela constraint do banco;
- há Diretor/root ativo com hash PBKDF2;
- não há admin ativo sem `passphrase_hash`;
- RPCs sensíveis negam `anon` e são alcançáveis por `service_role`;
- o teste limpa dados temporários e confirma ausência de resíduos.
