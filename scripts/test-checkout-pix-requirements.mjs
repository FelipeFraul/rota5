import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const checkoutClientPath = new URL("../src/app/checkout/[orderId]/checkout-client.tsx", import.meta.url);
const comboCheckoutClientPath = new URL("../src/app/combo-checkout/[orderId]/combo-checkout-client.tsx", import.meta.url);
const checkoutPayApiPath = new URL("../src/app/api/checkout/mercado-pago/pay/route.ts", import.meta.url);
const comboCheckoutPayApiPath = new URL("../src/app/api/combo-checkout/mercado-pago/pay/route.ts", import.meta.url);

async function source(path) {
  return readFile(path, "utf8");
}

test("checkout Pix requires email and CPF before generating code", async () => {
  const [checkout, comboCheckout, checkoutApi, comboCheckoutApi] = await Promise.all([
    source(checkoutClientPath),
    source(comboCheckoutClientPath),
    source(checkoutPayApiPath),
    source(comboCheckoutPayApiPath),
  ]);

  for (const client of [checkout, comboCheckout]) {
    assert.match(client, /isValidCheckoutEmail\(email\) && onlyDigits\(identificationNumber\)\.length === 11/);
    assert.match(client, /disabled=\{loading \|\| !canGeneratePix\}/);
    assert.match(client, /\{loading \? "Gerando Pix\.\.\." : "Gerar Pix"\}/);
    assert.match(client, /!pixCode \? \(/);
    assert.match(client, /setMessage\(null\)/);
    assert.doesNotMatch(client, /Pix gerado/);
    assert.doesNotMatch(client, /Gerar Pix de/);
  }

  assert.match(checkoutApi, /method === "pix"[\s\S]*isValidCheckoutEmail\(emailValue\)[\s\S]*onlyDigits\(cpfValue\)\.length !== 11/);
  assert.match(comboCheckoutApi, /isValidCheckoutEmail\(emailValue\)[\s\S]*onlyDigits\(cpfValue\)\.length !== 11/);
});
