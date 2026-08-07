/**
 * Klien Supabase — dipakai murni buat auth + database (§2.3).
 * Kunci publishable memang aman di client; datanya dijaga RLS.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

/**
 * `null` kalau env belum diisi — app tetap jalan penuh offline-only
 * (semua fitur lokal hidup, cuma gak ada sync). Ini bikin `pnpm dev`
 * langsung bisa dipakai tanpa setup Supabase dulu.
 */
export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null;

export const supabaseConfigured = supabase !== null;
