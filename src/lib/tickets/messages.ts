export const TICKET_MESSAGES = {
  genericHelp:
    "Olá! Me diga qual evento você procura.\nVocê pode mandar o nome do artista, cidade, local ou data.\n\nExemplos:\n- Ana Castela\n- shows em Sorocaba\n- Bancários\n- 8 de agosto",
  noEventsFound:
    'Não encontrei eventos com essa busca.\nTente enviar o nome do artista, cidade, local ou data. Ex: "shows em Sorocaba", "Bancários" ou "8 de agosto".',
  numericInvalidOption:
    "Não encontrei essa opção. Responda com um número da lista.",
  numericWithoutContext:
    "Me diga primeiro qual evento você procura. Você pode mandar o nome do artista, cidade, local ou data.",
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
    "Digite o número de ingressos para compra, ex: 2",
  seatInvalidOption:
    "ASSENTO INDISPONÍVEL",
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
  buyerAntiAbuseLimited:
    "Muitas tentativas em pouco tempo.\nPor segurança, aguarde alguns minutos antes de tentar novamente.",
  paymentLinkPrompt: "Para comprar sua reserva, responda COMPRAR.",
  reservationCancelled:
    "PROCESSO CANCELADO\nSua reserva foi cancelada e os ingressos foram liberados.\nPara começar de novo, envie o nome do evento, artista, cidade ou data.",
  reservationExpired:
    "⏰ A SUA RESERVA EXPIROU\nOs ingressos foram liberados novamente para venda.\nPara ver o mesmo evento ou buscar outro, só digitar uma nova busca.",
  buyerFlowReset:
    "PROCESSO CANCELADO\nPara começar de novo, envie o nome do evento, artista, cidade ou data.",
  reservationUnavailableForPayment:
    "Sua reserva não está mais disponível. Faça uma nova busca para escolher outro assento.",
  checkoutGenericError:
    "Não consegui gerar o link de pagamento agora. Tente novamente em instantes.",
  gateAdminInvalidCommand:
    "Para criar acesso de portaria, entre no admin, escolha Portaria e depois Check-in.",
  gateAdminOptionInvalid:
    "Não encontrei essa opção de portaria. Responda com um número do menu.",
  gateAdminCreateError:
    "Não consegui criar o acesso de portaria agora. Tente novamente em instantes.",
  adminReservedNeutral:
    "Não consegui entender sua mensagem.\nMe diga o nome do evento, artista, cidade, local ou data que você procura.",
  adminAuthPrompt:
    "Abra o link de login enviado, informe sua senha individual e depois envie aqui o código de uso único.",
  adminAuthInvalid:
    "Código inválido ou expirado. Envie admin para gerar um novo link de login.",
  adminAuthTemporaryLocked:
    "Muitas tentativas incorretas. Por segurança, este acesso foi bloqueado por {minutes} minutos.",
  adminAuthHardLocked:
    "Este acesso foi bloqueado por segurança. Peça ao Diretor para liberar seu administrador.",
  adminAuthMissingPassphrase:
    "Não foi possível autenticar este acesso. Peça ao Diretor para redefinir sua senha.",
  adminSessionExpired:
    "Sua sessão administrativa expirou. Envie admin para autenticar novamente.",
  adminLogout: "Sessão administrativa encerrada.",
  adminGenericError:
    "Não consegui acessar o menu administrativo agora. Tente novamente em instantes.",
  adminOptionUnavailable:
    "Essa opção administrativa ainda está em construção.",
} as const;
