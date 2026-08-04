type PublicHelpTopic = {
  id: string;
  question: string;
  keywords: string[];
  answer: string;
};

const HELP_PAGE_SIZE = 5;

export type PublicHelpSearchResult = {
  option: number;
  id: string;
  question: string;
  answer: string;
};

const HELP_PROMPT =
  "*TÓPICO DE AJUDA*\nDigite duas palavras sobre sua dúvida:";

const HELP_TOPICS: PublicHelpTopic[] = [
  {
    id: "buscar-evento",
    question: "Como procurar um evento?",
    keywords: ["buscar", "procurar", "pesquisar", "evento", "show", "agenda"],
    answer:
      "Digite o nome do artista, cidade, local ou data. Exemplos: `Valio`, `Sorocaba`, `Black House`, `amanhã` ou `8 de agosto`.",
  },
  {
    id: "nao-encontrei-evento",
    question: "Não encontrei o evento. O que faço?",
    keywords: ["nao", "encontrei", "evento", "busca", "resultado", "agenda"],
    answer:
      "Tente pesquisar com menos palavras ou por outro dado do evento: artista, cidade, local ou data. Se o evento não aparecer, ele pode não estar publicado ou não estar com vendas abertas.",
  },
  {
    id: "saber-mais",
    question: "Como ver informações do evento?",
    keywords: ["saber", "mais", "informacao", "informacoes", "descricao", "evento"],
    answer:
      "Quando aparecer um evento, digite a opção `Saber mais`. O sistema mostra as informações cadastradas e depois oferece as opções de comprar ou fazer uma nova pesquisa.",
  },
  {
    id: "evento-status",
    question: "O que significa o status de vendas do evento?",
    keywords: ["status", "vendas", "abertas", "em breve", "evento", "sessao"],
    answer:
      "`Vendas abertas` significa que a sessão está disponível para compra. `Em breve` indica que o evento/sessão existe, mas ainda não está aberto para venda naquele momento.",
  },
  {
    id: "evento-foto",
    question: "Por que o evento aparece com foto ou sem foto?",
    keywords: ["foto", "imagem", "cartaz", "evento", "banner", "whatsapp"],
    answer:
      "Quando o evento tem imagem cadastrada, o WhatsApp envia a foto com a legenda do evento. Se não houver imagem disponível, o sistema envia apenas o texto com os dados e opções.",
  },
  {
    id: "multiplos-eventos",
    question: "O que fazer quando aparecem vários eventos?",
    keywords: ["varios", "vários", "eventos", "lista", "opcao", "opção"],
    answer:
      "Quando aparecem vários eventos, cada um vem numerado. Digite o número do evento desejado para continuar a compra daquele evento.",
  },
  {
    id: "buscar-outro-evento",
    question: "Como fazer uma nova pesquisa depois do resultado?",
    keywords: ["buscar", "outro", "evento", "opcao", "opção", "nova"],
    answer:
      "Digite uma palavra para iniciar uma nova pesquisa por artista, cidade, local ou data.",
  },
  {
    id: "comprar-ingresso",
    question: "Como comprar ingresso pelo WhatsApp?",
    keywords: ["comprar", "ingresso", "compra", "whatsapp", "pedido", "evento"],
    answer:
      "Procure o evento, escolha `Comprar`, selecione setor/ingresso, informe a quantidade e escolha os assentos quando houver mapa. Depois confirme a reserva e digite `COMPRAR` para receber o link de pagamento.",
  },
  {
    id: "setor",
    question: "O que é setor?",
    keywords: ["setor", "entrada", "pista", "mesa", "cadeira", "lugar"],
    answer:
      "Setor é a área do evento onde o ingresso vale, como Entrada Geral, Mesa, Pista ou outro nome definido pelo evento. Cada setor pode ter preço e disponibilidade próprios.",
  },
  {
    id: "tipo-ingresso",
    question: "O que é tipo de ingresso?",
    keywords: ["tipo", "inteira", "meia", "promocional", "ingresso", "valor"],
    answer:
      "Tipo de ingresso é a categoria de venda, como inteira, meia ou promocional. O sistema mostra o label cadastrado e o valor antes de criar a reserva.",
  },
  {
    id: "valor-taxa",
    question: "Como aparecem valor e taxa?",
    keywords: ["valor", "taxa", "preco", "preço", "cobranca", "cobrança"],
    answer:
      "O sistema mostra o valor do ingresso. Quando houver taxa cadastrada, ela aparece junto como taxa. Se ingresso e taxa forem zero, aparece `Gratuito`.",
  },
  {
    id: "a-partir-de",
    question: "O que significa valor a partir de?",
    keywords: ["a partir", "partir", "valor", "preco", "preço", "setor"],
    answer:
      "`A partir de` aparece quando um setor tem mais de um tipo/preço de ingresso. O sistema mostra o menor valor disponível daquele setor.",
  },
  {
    id: "valor-gratuito",
    question: "Por que aparece Gratuito em vez de R$ 0,00?",
    keywords: ["gratuito", "zero", "0", "0,00", "valor", "preco"],
    answer:
      "Quando preço e taxa são zero, o sistema mostra `Gratuito` para deixar claro que não haverá cobrança naquele ingresso.",
  },
  {
    id: "ingresso-gratuito",
    question: "Como funciona ingresso gratuito?",
    keywords: ["gratuito", "gratis", "grátis", "zero", "sem pagar", "ingresso"],
    answer:
      "Quando o ingresso é gratuito, o sistema mostra `Gratuito` e emite o QR Code sem cobrança. Basta escolher a quantidade permitida e concluir pelo WhatsApp.",
  },
  {
    id: "limite-gratuito",
    question: "Qual o limite de ingresso gratuito?",
    keywords: ["limite", "gratuito", "gratis", "quantidade", "maximo", "máximo"],
    answer:
      "Para ingresso gratuito, o máximo é 4 ingressos por pedido. Se digitar mais que 4, o sistema pede uma nova quantidade de 1 a 4.",
  },
  {
    id: "limite-pago",
    question: "Qual o limite de ingressos pagos por pedido?",
    keywords: ["limite", "pago", "quantidade", "maximo", "máximo", "pedido"],
    answer:
      "Para ingresso pago, o sistema aceita até 10 ingressos por pedido, desde que exista disponibilidade no setor/assentos escolhidos.",
  },
  {
    id: "quantidade",
    question: "Como informar a quantidade?",
    keywords: ["quantidade", "numero", "número", "ingressos", "digitar", "comprar"],
    answer:
      "Digite apenas o número de ingressos. Exemplo: `2`. Para ingresso gratuito, use de 1 a 4. Para ingresso pago, use até 10 por pedido.",
  },
  {
    id: "assentos",
    question: "Como escolher assentos?",
    keywords: ["assento", "assentos", "cadeira", "cadeiras", "mapa", "lugar"],
    answer:
      "Se o setor tiver assentos marcados, o sistema envia um mapa e pede os códigos disponíveis. Para 1 ingresso, envie algo como `A03`; para mais ingressos, envie todos, como `A03 A04`.",
  },
  {
    id: "mapa-assentos",
    question: "Como ler o mapa de assentos?",
    keywords: ["mapa", "assentos", "verde", "cinza", "ocupado", "livre"],
    answer:
      "No mapa enviado pelo WhatsApp, verde indica assento livre e cinza indica assento ocupado ou indisponível. Responda com o código do assento verde desejado.",
  },
  {
    id: "assentos-multiplos",
    question: "Como enviar vários assentos?",
    keywords: ["varios", "vários", "assentos", "codigos", "códigos", "virgula"],
    answer:
      "Quando comprar mais de 1 ingresso com assento marcado, envie exatamente a quantidade de códigos pedida. Pode usar espaço ou vírgula, como `A03 A04` ou `A03,A04`.",
  },
  {
    id: "assento-exatamente",
    question: "Por que preciso enviar exatamente a quantidade de assentos?",
    keywords: ["exatamente", "quantidade", "assentos", "codigo", "código", "erro"],
    answer:
      "Se você pediu 2 ingressos, precisa enviar 2 assentos disponíveis. Se enviar menos, mais ou um código indisponível, o sistema pede para corrigir.",
  },
  {
    id: "sem-assento-marcado",
    question: "Como funciona ingresso sem assento marcado?",
    keywords: ["sem", "assento", "marcado", "entrada", "geral", "quantidade"],
    answer:
      "Em setores sem assento marcado, você escolhe apenas a quantidade. O sistema cria a reserva sem pedir código de cadeira.",
  },
  {
    id: "assento-indisponivel",
    question: "Por que o assento ficou indisponível?",
    keywords: ["assento", "indisponivel", "indisponível", "ocupado", "reservado", "cadeira"],
    answer:
      "Um assento pode ficar indisponível se outra pessoa reservou antes, se foi vendido, bloqueado ou se a reserva expirou/foi alterada. Escolha outro assento disponível no mapa.",
  },
  {
    id: "reserva",
    question: "O que é reserva criada?",
    keywords: ["reserva", "criada", "pedido", "segurar", "ingresso", "tempo"],
    answer:
      "A reserva segura temporariamente os ingressos escolhidos enquanto você conclui a compra. Depois de criada, digite `COMPRAR` para gerar o pagamento.",
  },
  {
    id: "reserva-valor",
    question: "O que aparece na mensagem de reserva?",
    keywords: ["reserva", "mensagem", "evento", "setor", "valor", "validade"],
    answer:
      "A mensagem de reserva mostra evento, setor, tipo de ingresso, quantidade, valor total e horário de validade. Confira esses dados antes de digitar `COMPRAR`.",
  },
  {
    id: "tempo-reserva",
    question: "Quanto tempo dura a reserva?",
    keywords: ["tempo", "minutos", "reserva", "expira", "validade", "prazo"],
    answer:
      "A reserva fica válida pelo prazo informado na mensagem do WhatsApp. Normalmente o sistema mostra `Reserva válida até` com o horário limite.",
  },
  {
    id: "reserva-expirou",
    question: "Minha reserva expirou. E agora?",
    keywords: ["reserva", "expirou", "expirada", "vencida", "tempo", "prazo"],
    answer:
      "Quando a reserva expira, os ingressos são liberados novamente. Faça uma nova busca pelo evento e escolha ingressos/assentos disponíveis.",
  },
  {
    id: "cancelar-reserva",
    question: "Como cancelar ou sair de uma reserva?",
    keywords: ["cancelar", "sair", "reserva", "encerrar", "desistir", "apagar"],
    answer:
      "Digite `SAIR` ou `CANCELAR`. Se houver reserva ativa, o sistema cancela e libera os ingressos. Para voltar uma etapa sem sair, digite `VOLTAR`.",
  },
  {
    id: "voltar",
    question: "Como voltar uma etapa?",
    keywords: ["voltar", "volta", "etapa", "anterior", "corrigir", "trocar"],
    answer:
      "Digite `VOLTAR`. O sistema volta para a ação anterior: evento, setor, quantidade, assentos ou reserva, dependendo de onde você estiver.",
  },
  {
    id: "sair",
    question: "O que acontece ao digitar SAIR?",
    keywords: ["sair", "inicio", "início", "home", "nova", "pesquisa"],
    answer:
      "No fluxo público, `SAIR` cancela o processo atual e volta à página inicial para uma nova pesquisa. Se houver reserva ativa, ela pode ser cancelada e os ingressos liberados.",
  },
  {
    id: "comprar-reserva",
    question: "Depois da reserva, como pagar?",
    keywords: ["comprar", "pagar", "reserva", "pagamento", "link", "mercado"],
    answer:
      "Após a reserva criada, responda `COMPRAR`. O sistema envia o link de checkout para pagar por Pix, quando o ingresso não for gratuito.",
  },
  {
    id: "comandos-pagamento",
    question: "Quais palavras geram o link de pagamento?",
    keywords: ["comprar", "pagar", "pagamento", "link", "reserva", "comando"],
    answer:
      "Depois da reserva, você pode digitar `COMPRAR`, `PAGAR`, `PAGAMENTO` ou pedir o `LINK`. O sistema entende essas palavras e gera o checkout.",
  },
  {
    id: "pix",
    question: "Como pagar por Pix?",
    keywords: ["pix", "copia", "cola", "codigo", "código", "pagamento"],
    answer:
      "Abra o link de pagamento e gere o código Pix. Copie o Pix copia e cola, pague no app do banco e aguarde a confirmação. A tela muda para pagamento aprovado quando o sistema recebe a confirmação.",
  },
  {
    id: "cpf-email",
    question: "Por que pede CPF e e-mail no pagamento?",
    keywords: ["cpf", "email", "e-mail", "pagamento", "pix"],
    answer:
      "O checkout usa CPF e e-mail para a Black House processar a tentativa de pagamento por Pix e validar a compra quando necessário.",
  },
  {
    id: "pagamento-aprovado",
    question: "O que acontece quando o pagamento aprova?",
    keywords: ["pagamento", "aprovado", "confirmado", "ingresso", "qr", "whatsapp"],
    answer:
      "Quando o pagamento é aprovado, o pedido vira pago, os ingressos são emitidos e o QR Code é enviado pelo WhatsApp. A tela do checkout também mostra confirmação verde de pagamento aprovado.",
  },
  {
    id: "pagamento-pendente",
    question: "Meu pagamento está pendente. O que faço?",
    keywords: ["pagamento", "pendente", "aguardando", "pix", "demora", "confirmacao"],
    answer:
      "Aguarde a confirmação da Black House. No Pix, a confirmação pode levar alguns instantes após pagar no banco. Se a reserva expirar antes da aprovação, faça uma nova compra.",
  },
  {
    id: "link-pagamento-indisponivel",
    question: "O link de pagamento não abriu ou está indisponível.",
    keywords: ["link", "pagamento", "indisponivel", "indisponível", "checkout", "erro"],
    answer:
      "O link pode ficar indisponível se a reserva expirou, foi cancelada ou deixou de estar aguardando pagamento. Volte ao WhatsApp, busque o evento e gere uma nova compra.",
  },
  {
    id: "checkout-expirado",
    question: "A tela diz pagamento indisponível. Por quê?",
    keywords: ["pagamento", "indisponivel", "indisponível", "tela", "checkout", "expirou"],
    answer:
      "A tela de pagamento fica indisponível quando a reserva expirou, foi cancelada ou já não está aguardando pagamento. Volte ao WhatsApp e gere uma nova compra.",
  },
  {
    id: "receber-ingresso",
    question: "Como recebo meu ingresso?",
    keywords: ["receber", "ingresso", "qr", "qrcode", "whatsapp", "ticket"],
    answer:
      "Depois do pagamento aprovado ou da emissão gratuita, o sistema envia pelo WhatsApp uma mensagem com os dados do ingresso e a imagem do QR Code.",
  },
  {
    id: "nao-recebi-ingresso",
    question: "Paguei e não recebi o ingresso.",
    keywords: ["nao", "recebi", "ingresso", "paguei", "pagamento", "whatsapp"],
    answer:
      "Aguarde alguns instantes. A entrega depende da confirmação do pagamento e do envio pelo WhatsApp. Se o pagamento foi aprovado, digite `REENVIAR INGRESSO` neste mesmo WhatsApp para receber novamente o ingresso pago emitido para este telefone.",
  },
  {
    id: "reenviar-ingresso",
    question: "Como reenviar meu ingresso pago?",
    keywords: ["reenviar", "reenvio", "ingresso", "pago", "qr", "qrcode", "ticket"],
    answer:
      "Digite `REENVIAR INGRESSO` no mesmo WhatsApp usado na compra. Se houver apenas um ingresso pago emitido, o sistema envia na hora. Se houver mais de um evento, escolha o número do evento desejado.",
  },
  {
    id: "qr-code",
    question: "Como usar o QR Code do ingresso?",
    keywords: ["qr", "qrcode", "code", "codigo", "código", "entrada"],
    answer:
      "Apresente o QR Code na portaria do evento. Ele será validado uma única vez. Por segurança, não compartilhe o QR Code com terceiros.",
  },
  {
    id: "qr-invalido",
    question: "Por que meu QR Code deu inválido?",
    keywords: ["qr", "invalido", "inválido", "recusado", "portaria", "entrada"],
    answer:
      "O QR Code pode ser inválido se o ingresso não existe, já foi usado, pertence a outro evento/sessão ou o link/token foi alterado. Confira se está apresentando o QR correto.",
  },
  {
    id: "qr-usado",
    question: "O QR Code pode ser usado mais de uma vez?",
    keywords: ["qr", "usado", "uma", "vez", "reutilizar", "validado"],
    answer:
      "Não. Cada QR Code é validado uma única vez na portaria. Depois de usado, ele não libera nova entrada.",
  },
  {
    id: "link-ingresso-invalido",
    question: "O link do ingresso abriu como inválido.",
    keywords: ["link", "ingresso", "invalido", "inválido", "token", "abrir"],
    answer:
      "O link do ingresso pode aparecer inválido se foi alterado, copiado incompleto ou se o token não confere. Use a imagem do QR Code recebida no WhatsApp ou peça ajuda à equipe.",
  },
  {
    id: "dados-ingresso",
    question: "Quais dados aparecem no ingresso?",
    keywords: ["dados", "ingresso", "evento", "local", "setor", "codigo"],
    answer:
      "O ingresso mostra evento, data, local, setor, ingresso/assento e código do ticket. Esses dados também aparecem na mensagem enviada pelo WhatsApp.",
  },
  {
    id: "cortesia",
    question: "Como funciona cortesia recebida?",
    keywords: ["cortesia", "cortesias", "convite", "gratis", "grátis", "receber"],
    answer:
      "Se uma cortesia foi emitida para seu telefone, o sistema pode reenviar o ingresso disponível para esse número. O QR Code da cortesia também deve ser apresentado na portaria.",
  },
  {
    id: "retirar-cortesia",
    question: "Como retirar ou consultar minha cortesia?",
    keywords: ["retirar", "consultar", "cortesia", "convite", "telefone", "whatsapp"],
    answer:
      "Use o mesmo WhatsApp para o qual a cortesia foi emitida. Se houver cortesia disponível para esse telefone, o sistema envia os dados e o QR Code.",
  },
  {
    id: "evento-cancelado",
    question: "E se o evento for cancelado ou encerrado?",
    keywords: ["evento", "cancelado", "encerrado", "fechado", "status", "vendas"],
    answer:
      "Eventos cancelados, encerrados ou sem sessão disponível não aparecem para compra. Se uma compra já foi feita, acompanhe a comunicação oficial da Black House.",
  },
  {
    id: "vendas-fechadas",
    question: "Por que as vendas não estão abertas?",
    keywords: ["vendas", "fechadas", "indisponivel", "indisponível", "sessao", "sessão"],
    answer:
      "A venda depende do status do evento/sessão, disponibilidade de setor e preço ativo. Se não aparecer setor ou preço, pode não haver ingressos ativos naquele momento.",
  },
  {
    id: "sem-assentos",
    question: "Não tem assentos disponíveis.",
    keywords: ["sem", "assentos", "lugares", "esgotado", "disponivel", "disponível"],
    answer:
      "Se não houver assentos disponíveis, o setor pode estar esgotado, bloqueado ou temporariamente reservado por outras pessoas. Tente outro setor ou faça nova busca depois.",
  },
  {
    id: "reserva-ativa-existe",
    question: "O sistema diz que já tenho reserva em andamento.",
    keywords: ["reserva", "andamento", "ativa", "existe", "comprar", "trocar"],
    answer:
      "Isso significa que há uma reserva pendente no seu telefone. Digite `COMPRAR` para seguir com ela ou `SAIR`/`CANCELAR` para liberar os ingressos e começar de novo.",
  },
  {
    id: "anti-abuso",
    question: "Por que fui limitado por muitas tentativas?",
    keywords: ["limitado", "tentativas", "bloqueio", "seguranca", "segurança", "risco"],
    answer:
      "Por segurança, o sistema limita muitas tentativas em pouco tempo. Aguarde alguns minutos antes de tentar reservar novamente.",
  },
  {
    id: "portaria",
    question: "Como funciona a validação na portaria?",
    keywords: ["portaria", "validacao", "validação", "entrada", "checkin", "check-in"],
    answer:
      "A equipe do evento lê o QR Code do ingresso. Se estiver válido, aparece acesso liberado. Se estiver inválido ou já usado, aparece aviso vermelho de QR Code inválido.",
  },
  {
    id: "acesso-portaria",
    question: "Recebi acesso temporário à portaria. O que faço?",
    keywords: ["acesso", "temporario", "temporário", "portaria", "senha", "checkin"],
    answer:
      "Abra o link recebido neste celular e informe a palavra-chave cadastrada quando solicitado. Esse acesso é temporário e deve ser usado apenas pela equipe autorizada.",
  },
  {
    id: "camera-checkin",
    question: "A câmera do check-in não funciona.",
    keywords: ["camera", "câmera", "checkin", "check-in", "barcode", "qr"],
    answer:
      "Use um navegador com permissão de câmera. Se a leitura automática de QR não for suportada, use o campo manual para colar o conteúdo do QR/link.",
  },
  {
    id: "ajuda",
    question: "Como usar a ajuda?",
    keywords: ["ajuda", "duvida", "dúvida", "sac", "pergunta", "suporte"],
    answer:
      "Digite `AJUDA` e depois duas palavras sobre sua dúvida, como `pagamento pix`, `qr invalido`, `reserva expirada` ou `ingresso gratuito`. O sistema mostra até 5 tópicos.",
  },
  {
    id: "falar-equipe",
    question: "Como falar com a equipe?",
    keywords: ["falar", "equipe", "atendente", "suporte", "black", "house"],
    answer:
      "Se a dúvida não for resolvida pela ajuda, procure a equipe da Black House pelos canais oficiais ou no local do evento.",
  },
];

function normalizeHelpText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreTopic(topic: PublicHelpTopic, queryTokens: string[]) {
  const question = normalizeHelpText(topic.question);
  const searchable = normalizeHelpText(
    [
      topic.question,
      topic.keywords.join(" "),
      topic.answer,
    ].join(" "),
  );
  let score = 0;

  for (const token of queryTokens) {
    if (topic.keywords.some((keyword) => normalizeHelpText(keyword) === token)) {
      score += 4;
    }

    if (question.includes(token)) {
      score += 3;
    } else if (searchable.includes(token)) {
      score += 1;
    }
  }

  return score;
}

export function isPublicHelpCommand(text: string) {
  const normalized = normalizeHelpText(text);

  return (
    normalized === "da uma mao" ||
    normalized === "ajuda" ||
    normalized === "help" ||
    normalized === "sac"
  );
}

export function formatPublicHelpPrompt() {
  return HELP_PROMPT;
}

export function searchPublicHelpTopics(query: string, page = 0) {
  const queryTokens = Array.from(
    new Set(
      normalizeHelpText(query)
        .split(" ")
        .filter((token) => token.length >= 2),
    ),
  );

  if (queryTokens.length === 0) {
    return {
      query,
      results: [] as PublicHelpSearchResult[],
      total: 0,
      page: 0,
      hasMore: false,
    };
  }

  const scored = HELP_TOPICS.map((topic) => ({
    topic,
    score: scoreTopic(topic, queryTokens),
  }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.topic.question.localeCompare(b.topic.question));

  const safePage = Math.max(0, page);
  const start = safePage * HELP_PAGE_SIZE;

  return {
    query,
    page: safePage,
    total: scored.length,
    hasMore: start + HELP_PAGE_SIZE < scored.length,
    results: scored.slice(start, start + HELP_PAGE_SIZE).map((item, index) => ({
      option: index + 1,
      id: item.topic.id,
      question: item.topic.question,
      answer: item.topic.answer,
    })),
  };
}

export function getPublicHelpTopicById(id: string) {
  return HELP_TOPICS.find((topic) => topic.id === id) ?? null;
}

export function formatPublicHelpResults({
  results,
  total,
  hasMore,
}: ReturnType<typeof searchPublicHelpTopics>) {
  if (results.length === 0) {
    return [
      "*TÓPICOS DE AJUDA*",
      "Não encontrei um tópico para essa dúvida.",
      "",
      "Digite outras duas palavras. Exemplos:",
      "> pagamento pix",
      "> qr invalido",
      "> reserva expirada",
    ].join("\n");
  }

  return [
    "*TÓPICOS DE AJUDA*",
    "Digite o número correspondente a sua dúvida:",
    ...results.map((result) => `> ${result.option}. ${result.question}`),
    "",
    `Encontrei ${total} ${total === 1 ? "tópico" : "tópicos"}.`,
    ...(hasMore ? ['Para ver outros tópicos referente ao assunto, digite "*VER MAIS*"'] : []),
    'Para sair do modo AJUDA, digite "*SAIR*"',
  ].join("\n");
}

export function formatPublicHelpAnswer(topic: PublicHelpTopic) {
  return [
    `*${topic.question.toUpperCase()}*`,
    topic.answer,
    "",
    "Para escolher uma pergunta da pesquisa anterior, digite o número ou digite outras duas palavras para uma nova pesquisa de ajuda. Para voltar onde estava, digite *VOLTAR*",
  ].join("\n");
}
