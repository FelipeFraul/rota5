# Visão Geral do Sistema

Atualizado em 25/05/2026.

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

URL principal de produção:

```text
https://site-phi-seven-72.vercel.app
```

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

### 5.2 Navegação

Regra importante:

- `Voltar` deve voltar uma única tela;
- `Cancelar` abandona a tela/fluxo atual;
- `Sair` sai da área admin;
- números devem funcionar para `Voltar` e `Sair` quando aparecem no menu;
- textos também devem funcionar.

O caminho de volta deve ser igual ao caminho de ida. Exemplo: se o admin entrou em `Editar valores`, depois listou preços ou alterou valor, `Voltar` deve retornar para `VALORES DE VENDA`, não para detalhe do evento ou lista de eventos.

Esse ponto precisa continuar sendo auditado em todos os subfluxos.

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

Ao terminar a edição/criação, o sistema deve perguntar se o admin quer deixar como rascunho ou publicar.

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

Ao digitar o valor, troca direto.

Se houver mais informações além do valor, elas devem ser separadas em outro fluxo. Não deve exigir que o admin envie label, preço, taxa, início e fim tudo junto.

### 6.10 Duplicar evento

Existe a necessidade de duplicar um evento.

Fluxo desejado:

- admin escolhe o evento;
- sistema duplica dados principais, sessões, setores, assentos e preços;
- em seguida joga o admin para a tela de edição do evento duplicado;
- admin altera o necessário e publica.

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

## 8. Cortesias

Menu:

```text
CORTESIAS

> 1. Gerar cortesia
> 2. Listar cortesias emitidas
> 3. Reenviar cortesia
> 4. Cancelar cortesia
> 5. Definir limite de cortesias
> 6. Voltar
> 7. Sair
```

### 8.1 Conceito

Cortesia é um ingresso emitido pelo administrador.

Regra importante:

- o sistema não deve enviar automaticamente a cortesia para todos os telefones cadastrados;
- se forem mil cortesias, disparar mil WhatsApps pode derrubar/bloquear o número;
- o convidado deve escrever `CORTESIA` na conversa;
- se o telefone tiver cortesia ativa, recebe o QRCode.

### 8.2 Gerar cortesia

Pode ser:

- individual;
- em lote.

Fluxo:

- escolher individual ou lote;
- informar telefone(s);
- escolher evento;
- sistema registra a cortesia;
- admin recebe confirmação.

Mensagem de sucesso:

```text
CORTESIA GERADA COM SUCESSO PARA:

> 5515997503836

Informe ao contato que para receber sua cortesia, deve enviar "Cortesia" para este mesmo número.
```

Se não puder emitir por limite:

```text
NÃO FOI POSSÍVEL EMITIR CORTESIA.
O LIMITE DO EVENTO É DE [NÚMERO] DE CORTESIAS
```

### 8.3 Limite de cortesias

O limite de cortesia é do evento.

Regra:

- o limite considera emissão histórica;
- se a cortesia foi cancelada, usada ou alterada, isso não devolve o limite;
- limite é quantidade total emitida permitida.

Mensagem para definir limite:

```text
DEFINIR NOVO LIMITE DE CORTESIAS
> Hoje, limite de [numero] cortesias

Digite o novo limite TOTAL de cortesias para este evento. Use 0 para remover limite.
```

### 8.4 Cancelar cortesia

Antes de listar todas as cortesias, deve perguntar:

```text
1. Cancelar pelo número de telefone
2. Cancelar pelo código
3. Ver todas as cortesias
4. Voltar
5. Sair
```

Só depois deve buscar/listar.

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
> 5. Voltar
> 6. Sair
```

O item `Limites de cortesias` não deve ficar em Administradores, porque o limite é do evento.

### 10.1 Adicionar administrador

Fluxo desejado:

Mensagem 1:

```text
QUAL O TIPO DE ADMINISTRADOR VOCÊ QUER CADASTRAR?
> 1. Diretor - Acesso total ao sistema. Pode gerenciar eventos, ingressos, cortesias, portaria, relatórios e outros administradores.
> 2. Gerente - Pode gerenciar eventos, ingressos, cortesias, portaria e relatórios. Não gerencia, inclui ou exclui outros administradores.
> 3. Operador - Gerencia cortesias e relatórios
```

Mensagem 2:

```text
QUAL TELEFONE DO ADMINISTRADOR?
```

Mensagem 3:

```text
QUAL O NOME DO ADMINISTRADOR?
```

Mensagem 4:

```text
QUAL A PALAVRA CHAVE (SENHA) DO ADMINISTRADOR?
```

Mensagem final:

```text
ADMINISTRADOR CADASTRADO
> Telefone: ...
> Nome: ...
> Perfil: Gerente
> Palavra chave: ...
```

O sistema deve amarrar permissões reais ao perfil escolhido.

## 11. Relatórios

Menu:

```text
RELATÓRIOS

> 1. Vendas por evento
> 2. Vendas por setor
> 3. Reservas expiradas
> 4. Check-ins da portaria
> 5. Ingressos usados e não usados
> 6. Resumo geral
> 7. Voltar
> 8. Sair
```

O antigo item `Pagamentos pendentes` foi removido.

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

- Vendidos: ingressos pagos;
- Cortesias: ingressos gratuitos/cortesia;
- Emitidos: vendidos + cortesias;
- Usados: ingressos validados na portaria;
- Receita: soma dos ingressos pagos, sem cortesias.

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

Neste relatório:

- `Evento:` fica sem `>`;
- `Local` não aparece.

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
> Barrados: X
Barrados:
> QRCode gerado pelo sistema: X
> QRCode não gerado pelo sistema: X
```

Definições:

- Emitidos: tickets emitidos e não cancelados;
- Não usados: emitidos menos usados;
- Usados: tickets validados;
- Cancelados: tickets cancelados;
- Barrados: tentativas negadas na portaria;
- QRCode gerado pelo sistema: QRCode reconhecido, mas negado por motivo como já usado/cancelado/negado;
- QRCode não gerado pelo sistema: QRCode inválido ou não encontrado.

Neste relatório:

- `Evento:` fica sem `>`;
- `Local` não aparece;
- não deve aparecer `Total considerado`.

### 11.4 Resumo geral

Neste relatório:

- `Evento:` fica sem `>`;
- `Local` não aparece.

## 12. Regras de segurança e consistência

- Pagamento só é confirmado pelo webhook do Mercado Pago.
- O sistema não deve marcar pedido como pago manualmente fora da confirmação segura.
- Reserva usa RPC transacional no Supabase.
- Validação de portaria usa RPC transacional e bloqueia reuso.
- QRCode/token bruto não deve ser armazenado em texto puro.
- Admin por WhatsApp deve exigir sessão autenticada.
- Senha/palavra-chave de admin deve ser armazenada com hash.
- Mensagens sensíveis não devem gravar senha em texto.
- O número root principal pode ver tudo; produtores/artistas devem ver apenas seus eventos.

## 13. Pontos ainda frágeis ou a revisar

- Revisar todos os caminhos de `Voltar` para garantir uma tela por vez.
- Refinar desenho visual dos mapas de assentos para teatros com lacunas e deslocamentos.
- Garantir que criação de evento sempre passe por setores/assentos quando for assento marcado.
- Refinar edição de dados para sempre ser simples e separada por campo.
- Revisar todos os relatórios para manter layout consistente.
- Confirmar fluxo completo de duplicar evento.
- Confirmar permissões reais por perfil em todos os menus/submenus.
- Confirmar comportamento de cortesias em lote sem disparo automático.
- Criar/validar reenvio manual de cortesia/ticket.
- Revisar cancelamento de reservas e mensagens de expiração em todos os estados.
