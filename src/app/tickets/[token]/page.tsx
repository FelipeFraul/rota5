import { InformationPage } from "@/app/InformationPage";
import { getTicketBySignedToken } from "@/lib/tickets/services/tickets";

type TicketPageProps = {
  params: Promise<{
    token: string;
  }>;
};

export default async function TicketPage({ params }: TicketPageProps) {
  const { token } = await params;
  const ticket = await getTicketBySignedToken(token);

  if (!ticket) {
    return (
      <InformationPage
        eyebrow="Ingresso"
        title="Ingresso inválido"
        description="Não foi possível validar este link de ingresso."
      />
    );
  }

  return (
    <InformationPage
      eyebrow="Ingresso"
      title="Dados do ingresso"
      description="Apresente este QR Code ou link na entrada. A validação será feita pela equipe do evento."
    >
      <dl className="information-details">
        <dt>Evento</dt>
        <dd>{ticket.eventTitle}</dd>
        <dt>Local</dt>
        <dd>
          {ticket.venueName ?? "A confirmar"} - {ticket.city}/{ticket.state}
        </dd>
        <dt>Setor</dt>
        <dd>{ticket.sectionName}</dd>
        <dt>Assento</dt>
        <dd>{ticket.seatCode}</dd>
        <dt>Código</dt>
        <dd>{ticket.ticketCode}</dd>
      </dl>
    </InformationPage>
  );
}
