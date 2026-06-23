import BrandLogo from "@/app/BrandLogo";

export default function CheckoutFailurePage() {
  return (
    <main>
      <BrandLogo />
      <h1>Pagamento não concluído</h1>
      <p>A reserva só será confirmada após um pagamento aprovado.</p>
    </main>
  );
}
