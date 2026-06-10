import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizeWhatsAppPhone } from "@/lib/tickets/phones";

export type TicketCustomer = {
  id: string;
  whatsapp_phone: string;
  name: string | null;
};

type UpsertCustomerFromWhatsAppInput = {
  phone: string;
  name?: string | null;
};

const GENERIC_WHATSAPP_NAMES = new Set([
  "cliente",
  "contato",
  "unknown",
  "desconhecido",
  "sem nome",
  "no name",
]);

function normalizeCustomerName(name?: string | null) {
  const normalizedName = name?.trim() || null;

  if (!normalizedName) {
    return null;
  }

  if (GENERIC_WHATSAPP_NAMES.has(normalizedName.toLowerCase())) {
    return null;
  }

  return normalizedName;
}

export async function upsertCustomerFromWhatsApp({
  phone,
  name,
}: UpsertCustomerFromWhatsAppInput) {
  const supabase = getSupabaseAdmin();
  const normalizedPhone = normalizeWhatsAppPhone(phone);
  const normalizedName = normalizeCustomerName(name);

  if (!normalizedPhone) {
    return {
      ok: false as const,
      error: { code: "invalid_phone", message: "Invalid WhatsApp phone" },
    };
  }

  const { data: existingCustomer, error: existingCustomerError } = await supabase
    .from("customers")
    .select("id, whatsapp_phone, name")
    .eq("whatsapp_phone", normalizedPhone)
    .maybeSingle<TicketCustomer>();

  if (existingCustomerError) {
    return {
      ok: false as const,
      error: existingCustomerError,
    };
  }

  if (existingCustomer) {
    if (normalizedName && normalizedName !== existingCustomer.name) {
      const { data: updatedCustomer, error: updateError } = await supabase
        .from("customers")
        .update({ name: normalizedName })
        .eq("id", existingCustomer.id)
        .select("id, whatsapp_phone, name")
        .single<TicketCustomer>();

      if (updateError) {
        return {
          ok: false as const,
          error: updateError,
        };
      }

      return {
        ok: true as const,
        customer: updatedCustomer,
      };
    }

    return {
      ok: true as const,
      customer: existingCustomer,
    };
  }

  const { data: customer, error: insertError } = await supabase
    .from("customers")
    .insert({
      whatsapp_phone: normalizedPhone,
      name: normalizedName,
    })
    .select("id, whatsapp_phone, name")
    .single<TicketCustomer>();

  if (insertError) {
    return {
      ok: false as const,
      error: insertError,
    };
  }

  return {
    ok: true as const,
    customer,
  };
}
