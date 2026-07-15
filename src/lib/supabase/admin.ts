import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let supabaseAdmin: SupabaseClient | null = null;

function getRequiredSupabaseAdminEnv() {
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !/^https?:\/\//i.test(supabaseUrl)) {
    throw new Error("Invalid Supabase admin configuration. SUPABASE_URL must be a valid URL.");
  }

  if (!serviceRoleKey) {
    throw new Error("Invalid Supabase admin configuration. SUPABASE_SERVICE_ROLE_KEY is required.");
  }

  return { supabaseUrl, serviceRoleKey };
}

export function getSupabaseAdmin(): SupabaseClient {
  if (!supabaseAdmin) {
    const env = getRequiredSupabaseAdminEnv();

    supabaseAdmin = createClient(
      env.supabaseUrl,
      env.serviceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );
  }

  return supabaseAdmin;
}
