import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type TicketCustomer = {
  id: string;
  whatsapp_phone: string;
  name: string | null;
};

type UpsertCustomerFromWhatsAppInput = {
  phone: string;
  name?: string | null;
};

export async function upsertCustomerFromWhatsApp({
  phone,
  name,
}: UpsertCustomerFromWhatsAppInput) {
  const supabase = getSupabaseAdmin();
  const normalizedName = name?.trim() || null;
  const { data: existingCustomer, error: existingCustomerError } = await supabase
    .from("customers")
    .select("id, whatsapp_phone, name")
    .eq("whatsapp_phone", phone)
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
      whatsapp_phone: phone,
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
