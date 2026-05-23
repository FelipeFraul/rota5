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
      <main>
        <h1>Ingresso inválido</h1>
        <p>Não foi possível validar este link de ingresso.</p>
      </main>
    );
  }

  return (
    <main>
      <h1>Ingresso</h1>
      <p>Apresente este QR Code/link na entrada.</p>
      <p>A validação será feita pela equipe do evento.</p>
      <dl>
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
    </main>
  );
}
