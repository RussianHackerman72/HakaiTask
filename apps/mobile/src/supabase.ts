/**
 * Klien Supabase buat mobile — dipakai murni buat auth + database (§2.3).
 *
 * Empat setelan beda dari web, dan tiga di antaranya WAJIB:
 *
 *  - `storage: SecureStore`. Token itu kredensial; di web dia mau gak mau
 *    numpang localStorage, di Android ada keystore beneran. Sekalian dipisah
 *    dari MMKV supaya kalau data lokal dibersihin, sesi gak ikut kebawa.
 *  - `detectSessionInUrl: false`. WAJIB. RN gak punya URL bar; kalau dibiarin
 *    true, supabase-js nyari fragment di alamat yang gak pernah ada.
 *  - `flowType: "pkce"`. Implicit flow naruh token di URL — di aplikasi
 *    native itu kelewat gampang bocor lewat log dan riwayat browser.
 *  - Auto-refresh diikat ke AppState: nge-refresh token pas app di background
 *    itu sia-sia dan bikin timer jalan terus.
 */
import { AppState } from "react-native";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";

const extra = Constants.expoConfig?.extra as
  | { supabaseUrl?: string; supabaseKey?: string }
  | undefined;

const url = extra?.supabaseUrl;
const key = extra?.supabaseKey;

/**
 * SecureStore nolak nilai di atas 2KB — token Supabase biasanya di bawah itu,
 * tapi kalau user_metadata-nya gendut bisa lewat. Gagal baca/tulis diperlakukan
 * sebagai "belum login", bukan crash.
 */
const secureStorage = {
  getItem: (k: string) => SecureStore.getItemAsync(k).catch(() => null),
  setItem: (k: string, v: string) => SecureStore.setItemAsync(k, v).catch(() => undefined),
  removeItem: (k: string) => SecureStore.deleteItemAsync(k).catch(() => undefined),
};

/**
 * `null` kalau env belum diisi — app tetap jalan penuh offline-only (semua
 * fitur lokal hidup, cuma gak ada sync). Kontrak yang sama kayak web, dan itu
 * yang bikin app-nya kepakai dari hari pertama tanpa setup Supabase dulu.
 */
export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        auth: {
          storage: secureStorage,
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
          flowType: "pkce",
        },
      })
    : null;

export const supabaseConfigured = supabase !== null;

if (supabase) {
  AppState.addEventListener("change", (s) => {
    if (s === "active") supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
