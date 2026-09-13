import { InformationPage } from "@/app/InformationPage";

export default function CheckoutSuccessPage() {
  return (
    <InformationPage
      eyebrow="Pagamento"
      title="Retorno do pagamento recebido"
      description="A confirmação final será feita após a validação do pagamento. O ingresso será liberado somente depois da aprovação."
    />
  );
}
