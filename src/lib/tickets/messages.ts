const PUBLIC_HOME_MESSAGE =
  "Ol\u00e1, bem-vindo(a) ao Rota5!";
const PUBLIC_HOME_COMMANDS_MESSAGE =
  "Digite *SHOW* para ver o proximo show\n\nDigite *TODOS* para ver proximos shows\n\nDigite *ENVIAR* para reenviar ingresso\n\nDigite *AJUDA* em caso de d\u00favidas\n\nDigite *NOVO* para uma nova pesquisa";

const PUBLIC_HOME_PROMPT = [
  PUBLIC_HOME_MESSAGE,
  PUBLIC_HOME_COMMANDS_MESSAGE,
].join("\n");
const PUBLIC_REENTRY_PROMPT = [
  "ATENDIMENTO",
  PUBLIC_HOME_COMMANDS_MESSAGE,
].join("\n\n");

export const TICKET_MESSAGES = {
  genericHelp: PUBLIC_HOME_MESSAGE,
  genericHelpCommands: PUBLIC_HOME_COMMANDS_MESSAGE,
  genericHelpPrompt: PUBLIC_HOME_PROMPT,
  reentryPrompt: PUBLIC_REENTRY_PROMPT,
  conversationClosed:
    "SessÃ£o encerrada. Para iniciar uma nova digite ZERO BALA",
  noEventsFound:
    "NÃ£o encontrei eventos com essa busca.\n\nTente pesquisar por outro nome, artista, data ou digite TODOS para ver os eventos disponÃ­veis.",
  numericInvalidOption:
    "NÃ£o encontrei essa opÃ§Ã£o. Responda com um nÃºmero da lista.",
  numericWithoutContext: PUBLIC_HOME_MESSAGE,
  eventOptionUnavailable:
    "Essa opÃ§Ã£o nÃ£o estÃ¡ mais disponÃ­vel. FaÃ§a uma nova busca.",
  noSectionsAvailable:
    "NÃ£o encontrei setores disponÃ­veis para essa sessÃ£o no momento. FaÃ§a uma nova busca ou tente outro evento.",
  sectionInvalidOption:
    "NÃ£o encontrei esse setor. Responda com um nÃºmero da lista.",
  sectionUnavailable:
    "Esse setor nÃ£o estÃ¡ mais disponÃ­vel. Escolha outro setor ou faÃ§a uma nova busca.",
  noSeatsAvailable:
    "*SEM DISPONIBILIDADE*\n\nNÃ£o hÃ¡ ingressos suficientes nesse setor para a quantidade solicitada. Veja abaixo outras opÃ§Ãµes disponÃ­veis.",
  unnumberedSectionPending:
    "Digite o nÃºmero de ingressos, *EX: 4*",
  seatInvalidOption:
    "ASSENTO INDISPONÃVEL",
  seatUnavailable:
    "Esse assento nÃ£o estÃ¡ mais disponÃ­vel. Escolha outro assento ou faÃ§a uma nova busca.",
  seatJustBecameUnavailable:
    "Esse assento acabou de ficar indisponÃ­vel. Escolha outro assento.",
  sectionPriceUnavailable:
    "NÃ£o encontrei preÃ§o ativo para esse setor no momento. Escolha outro setor ou tente mais tarde.",
  sessionUnavailable:
    "Essa sessÃ£o nÃ£o estÃ¡ mais disponÃ­vel. FaÃ§a uma nova busca.",
  reservationGenericError:
    "NÃ£o consegui reservar esse assento agora. Tente novamente em instantes.",
  reservationAlreadyCreated:
    "VocÃª jÃ¡ tem uma reserva em andamento. No prÃ³ximo passo vamos gerar o link de pagamento ou permitir cancelar/trocar.",
  buyerAntiAbuseLimited:
    "Muitas tentativas em pouco tempo.\nPor seguranÃ§a, aguarde alguns minutos antes de tentar novamente.",
  paymentLinkPrompt: "Para comprar sua reserva, responda COMPRAR.",
  reservationCancelled:
    `PROCESSO CANCELADO\nSua reserva foi cancelada e os ingressos foram liberados.\n\n${PUBLIC_HOME_MESSAGE}`,
  reservationExpired:
    "Seu tempo de reserva terminou. Digite ZERO BALA para uma nova pesquisa.",
  buyerInterestReminder:
    "ATENDIMENTO\n\nðŸš¨ Ãšltimos ingressos para {EVENTO}. Corra comprar o seu!\n> Digite *1* para comprar\n> Digite *2* para saber mais\n> Para uma nova pesquisa, ZERO BALA",
  buyerFlowReset:
    `PROCESSO CANCELADO\n\n${PUBLIC_HOME_MESSAGE}`,
  reservationUnavailableForPayment:
    "Sua reserva nÃ£o estÃ¡ mais disponÃ­vel. FaÃ§a uma nova busca para escolher outro assento.",
  checkoutGenericError:
    "NÃ£o consegui gerar o link de pagamento agora. Tente novamente em instantes.",
  freeTicketGenericError:
    "NÃ£o consegui emitir o ingresso gratuito agora. Tente novamente em instantes.",
  gateAdminInvalidCommand:
    "Para criar acesso de portaria ou cozinha, entre no admin, escolha Portaria e cozinha e gere os links de leitura.",
  gateAdminOptionInvalid:
    "NÃ£o encontrei essa opÃ§Ã£o de portaria. Responda com um nÃºmero do menu.",
  gateAdminCreateError:
    "NÃ£o consegui criar o acesso de portaria agora. Tente novamente em instantes.",
  adminReservedNeutral:
    `NÃ£o consegui entender sua mensagem.\n\n${PUBLIC_HOME_MESSAGE}`,
  adminAuthPrompt:
    "Abra o link de login enviado, informe sua senha individual e depois envie aqui o cÃ³digo de uso Ãºnico.",
  adminAuthInvalid:
    "CÃ³digo invÃ¡lido ou expirado. Envie admin para gerar um novo link de login.",
  adminAuthTemporaryLocked:
    "Muitas tentativas incorretas. Por seguranÃ§a, este acesso foi bloqueado por {minutes} minutos.",
  adminAuthHardLocked:
    "Este acesso foi bloqueado por seguranÃ§a. PeÃ§a ao Diretor para liberar seu administrador.",
  adminAuthMissingPassphrase:
    "NÃ£o foi possÃ­vel autenticar este acesso. PeÃ§a ao Diretor para redefinir sua senha.",
  adminSessionExpired:
    "SessÃ£o administrativa encerrada.",
  adminLogout: "SessÃ£o administrativa encerrada.",
  adminGenericError:
    "NÃ£o consegui acessar o menu administrativo agora. Tente novamente em instantes.",
  adminOptionUnavailable:
    "Essa opÃ§Ã£o administrativa ainda estÃ¡ em construÃ§Ã£o.",
} as const;

