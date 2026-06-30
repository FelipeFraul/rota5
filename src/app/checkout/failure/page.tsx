import { InformationPage } from "@/app/InformationPage";

export default function CheckoutFailurePage() {
  return (
    <InformationPage
      eyebrow="Pagamento"
      title="Pagamento não concluído"
      description="A reserva só será confirmada após um pagamento aprovado."
    />
  );
}
