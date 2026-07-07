const PUBLIC_HOME_MESSAGE =
  "Olá, *bem-vindo(a) à Black House*, casa de Comédia de Sorocaba!\nPesquise um evento por *nome, artista, data* ou...";
const PUBLIC_HOME_COMMANDS_MESSAGE =
  '> Para ver todos os eventos, digite "TODOS"\n> Para reenviar ingresso pago, digite "REENVIAR INGRESSO"\n> Para receber ajuda a qualquer momento, digite "AJUDA"\n> Para voltar à página inicial e fazer uma nova pesquisa, digite "SAIR"';

export const TICKET_MESSAGES = {
  genericHelp: PUBLIC_HOME_MESSAGE,
  genericHelpCommands: PUBLIC_HOME_COMMANDS_MESSAGE,
  noEventsFound:
    "Não encontrei eventos com essa busca.\n\nTente pesquisar por outro nome, artista, data ou digite TODOS para ver os eventos disponíveis.",
  numericInvalidOption:
    "Não encontrei essa opção. Responda com um número da lista.",
  numericWithoutContext: PUBLIC_HOME_MESSAGE,
  eventOptionUnavailable:
    "Essa opção não está mais disponível. Faça uma nova busca.",
  noSectionsAvailable:
    "Não encontrei setores disponíveis para essa sessão no momento. Faça uma nova busca ou tente outro evento.",
  sectionInvalidOption:
    "Não encontrei esse setor. Responda com um número da lista.",
  sectionUnavailable:
    "Esse setor não está mais disponível. Escolha outro setor ou faça uma nova busca.",
  noSeatsAvailable:
    "*SEM DISPONIBILIDADE*\n\nNão há ingressos suficientes nesse setor para a quantidade solicitada. Veja abaixo outras opções disponíveis.",
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
    `PROCESSO CANCELADO\nSua reserva foi cancelada e os ingressos foram liberados.\n\n${PUBLIC_HOME_MESSAGE}`,
  reservationExpired:
    "Seu tempo de reserva terminou. Se desejar comprar seu ingresso, pesquise novamente o evento.",
  buyerInterestReminder:
    "ATENDIMENTO\n\n🚨 Últimos ingressos para {EVENTO}. Corra comprar o seu!\n> Digite 1 para comprar\n> Digite 2 para saber mais\n> Digite uma palavra para nova pesquisa",
  buyerFlowReset:
    `PROCESSO CANCELADO\n\n${PUBLIC_HOME_MESSAGE}`,
  reservationUnavailableForPayment:
    "Sua reserva não está mais disponível. Faça uma nova busca para escolher outro assento.",
  checkoutGenericError:
    "Não consegui gerar o link de pagamento agora. Tente novamente em instantes.",
  freeTicketGenericError:
    "Não consegui emitir o ingresso gratuito agora. Tente novamente em instantes.",
  gateAdminInvalidCommand:
    "Para criar acesso de portaria ou cozinha, entre no admin, escolha Portaria e cozinha e gere os links de leitura.",
  gateAdminOptionInvalid:
    "Não encontrei essa opção de portaria. Responda com um número do menu.",
  gateAdminCreateError:
    "Não consegui criar o acesso de portaria agora. Tente novamente em instantes.",
  adminReservedNeutral:
    `Não consegui entender sua mensagem.\n\n${PUBLIC_HOME_MESSAGE}`,
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
    "Sessão administrativa encerrada.",
  adminLogout: "Sessão administrativa encerrada.",
  adminGenericError:
    "Não consegui acessar o menu administrativo agora. Tente novamente em instantes.",
  adminOptionUnavailable:
    "Essa opção administrativa ainda está em construção.",
} as const;
