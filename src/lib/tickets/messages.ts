export const TICKET_MESSAGES = {
  genericHelp:
    "Olá! Me diga qual evento você procura.\nVocê pode mandar o nome do artista, a cidade ou a data.\n\nExemplos:\n- Ana Castela\n- shows em Sorocaba\n- eventos sábado",
  noEventsFound:
    'Não encontrei eventos com essa busca.\nTente enviar o nome do artista, cidade ou data. Ex: "shows em Sorocaba" ou "Ana Castela em junho".',
  numericInvalidOption:
    "Não encontrei essa opção. Responda com um número da lista.",
  numericWithoutContext:
    "Me diga primeiro qual evento você procura. Você pode mandar o nome do artista, cidade ou data.",
  eventOptionUnavailable:
    "Essa opção não está mais disponível. Faça uma nova busca.",
  noSectionsAvailable:
    "Não encontrei setores disponíveis para essa sessão no momento. Faça uma nova busca ou tente outro evento.",
  sectionInvalidOption:
    "Não encontrei esse setor. Responda com um número da lista.",
  sectionUnavailable:
    "Esse setor não está mais disponível. Escolha outro setor ou faça uma nova busca.",
  noSeatsAvailable:
    "Não encontrei assentos disponíveis nesse setor no momento. Escolha outro setor ou faça uma nova busca.",
  unnumberedSectionPending:
    "Esse setor não tem assento marcado. No próximo passo você poderá escolher a quantidade de ingressos.",
  seatInvalidOption:
    "Não encontrei esse assento na lista. Escolha um dos códigos enviados.",
  seatUnavailable:
    "Esse assento não está mais disponível. Escolha outro assento ou faça uma nova busca.",
  seatJustBecameUnavailable:
    "Esse assento acabou de ficar indisponível. Escolha outro assento.",
  sectionPriceUnavailable:
    "Não encontrei preço ativo para esse setor no momento. Escolha outro setor ou tente mais tarde.",
  sessionUnavailable:
    "Essa sessão não está mais disponível. Faça uma nova busca.",
  reservationGenericError:
    "Não consegui reservar esse assento agora. Tente novamente em instantes.",
  reservationAlreadyCreated:
    "Você já tem uma reserva em andamento. No próximo passo vamos gerar o link de pagamento ou permitir cancelar/trocar.",
  paymentLinkPrompt: "Para pagar sua reserva, responda PAGAR.",
  reservationUnavailableForPayment:
    "Sua reserva não está mais disponível. Faça uma nova busca para escolher outro assento.",
  checkoutGenericError:
    "Não consegui gerar o link de pagamento agora. Tente novamente em instantes.",
  gateAdminInvalidCommand:
    "Para criar acesso de portaria, responda aqui com: portaria TELEFONE_DO_VALIDADOR entrada principal",
  gateAdminCreateError:
    "Não consegui criar o acesso de portaria agora. Tente novamente em instantes.",
  adminReservedNeutral:
    "Não consegui entender sua mensagem.\nMe diga o nome do evento, artista, cidade ou data que você procura.",
  adminAuthPrompt: "Envie a palavra-chave de acesso administrativo.",
  adminAuthInvalid: "Palavra-chave inválida.",
  adminSessionExpired:
    "Sua sessão administrativa expirou. Envie admin para autenticar novamente.",
  adminLogout: "Sessão administrativa encerrada.",
  adminGenericError:
    "Não consegui acessar o menu administrativo agora. Tente novamente em instantes.",
  adminOptionUnavailable:
    "Essa opção administrativa ainda está em construção.",
} as const;
