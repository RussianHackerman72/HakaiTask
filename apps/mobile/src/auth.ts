/**
 * Status auth — bentuknya sengaja sama persis kayak `useAuth` di web,
 * termasuk keadaan `"local"`: env Supabase kosong, app jalan penuh tanpa sync.
 * Itu yang bikin app-nya kepakai sebelum Supabase disetel sama sekali.
 */
import { useCallback, useEffect, useState } from "react";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import type { Session } from "@supabase/supabase-js";
import { DEFAULT_USER_NAME, localUserId } from "@hakaitask/app";
import { supabase } from "./supabase";

export type AuthStatus =
  | { state: "loading" }
  | { state: "signed-in"; userId: string; name: string; signOut: () => void }
  | { state: "signed-out" }
  | { state: "local"; userId: string; name: string };

function displayName(session: Session): string {
  const meta = session.user.user_metadata as Record<string, unknown>;
  const full = typeof meta.full_name === "string" ? meta.full_name : undefined;
  return (full ?? session.user.email ?? "kamu").split(" ")[0]!.split("@")[0]!;
}

export function useAuth(): AuthStatus {
  const [status, setStatus] = useState<AuthStatus>(() =>
    supabase
      ? { state: "loading" }
      : { state: "local", userId: localUserId(), name: DEFAULT_USER_NAME },
  );

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;

    const toStatus = (session: Session | null): AuthStatus =>
      session
        ? {
            state: "signed-in",
            userId: session.user.id,
            name: displayName(session),
            signOut: () => void client.auth.signOut(),
          }
        : { state: "signed-out" };

    void client.auth.getSession().then(({ data }) => setStatus(toStatus(data.session)));

    const { data: sub } = client.auth.onAuthStateChange((_e, session) =>
      setStatus(toStatus(session)),
    );

    return () => sub.subscription.unsubscribe();
  }, []);

  return status;
}

/** Alamat balik yang sama dipakai magic link & OAuth. */
export function redirectUri(): string {
  return Linking.createURL("/auth-callback");
}

export function useSignIn() {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const magicLink = useCallback(async (email: string) => {
    if (!supabase || !email.trim()) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectUri() },
    });
    setBusy(false);
    if (err) setError(err.message);
    else setSent(true);
  }, []);

  /**
   * Google lewat browser sistem, bukan WebView: `openAuthSessionAsync` pakai
   * Custom Tabs, jadi sesi Google yang udah ada di HP kepakai dan user gak
   * perlu ngetik password lagi. `skipBrowserRedirect` bikin kita yang pegang
   * kendali kapan browsernya dibuka dan ditutup.
   */
  const google = useCallback(async () => {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    try {
      const redirectTo = redirectUri();
      const { data, error: err } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (err || !data?.url) {
        setError(err?.message ?? "Gagal mulai masuk lewat Google.");
        return;
      }

      const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (res.type !== "success") return; // user nutup sendiri — bukan error

      const code = new URL(res.url).searchParams.get("code");
      if (!code) {
        setError("Balikan dari Google gak bawa kode.");
        return;
      }

      const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);
      if (exErr) setError(exErr.message);
    } finally {
      setBusy(false);
    }
  }, []);

  return { busy, sent, error, magicLink, google };
}

/**
 * Identitas efektif buat nulis data: id dari sesi kalau login, id lokal kalau
 * enggak. Dipisah dari `useAuth` supaya layar yang cuma butuh "siapa yang
 * punya baris ini" gak perlu ngurusin empat keadaan auth.
 */
export function useIdentity(): { userId: string; userName: string; signedIn: boolean } {
  const auth = useAuth();
  if (auth.state === "signed-in") {
    return { userId: auth.userId, userName: auth.name, signedIn: true };
  }
  if (auth.state === "local") {
    return { userId: auth.userId, userName: auth.name, signedIn: false };
  }
  // "loading" / "signed-out": tetap kepakai lokal, jadi app gak pernah macet
  // cuma gara-gara nunggu jaringan.
  return { userId: localUserId(), userName: DEFAULT_USER_NAME, signedIn: false };
}
