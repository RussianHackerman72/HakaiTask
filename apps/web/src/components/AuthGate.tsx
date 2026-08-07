import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase.js";
import { press, rise } from "../lib/motion.js";

export type AuthStatus =
  | { state: "loading" }
  | { state: "signed-in"; userId: string; name: string; signOut: () => void }
  | { state: "signed-out" }
  /** Env Supabase kosong — app jalan lokal doang, tanpa sync. */
  | { state: "local"; userId: string; name: string };

const LOCAL_USER_KEY = "hakaitask-local-user";

function localUserId(): string {
  let id = localStorage.getItem(LOCAL_USER_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(LOCAL_USER_KEY, id);
  }
  return id;
}

function displayName(session: Session): string {
  const meta = session.user.user_metadata as Record<string, unknown>;
  const full = typeof meta.full_name === "string" ? meta.full_name : undefined;
  return (full ?? session.user.email ?? "kamu").split(" ")[0]!.split("@")[0]!;
}

export function useAuth(): AuthStatus {
  const [status, setStatus] = useState<AuthStatus>(() =>
    supabase ? { state: "loading" } : { state: "local", userId: localUserId(), name: "Kai" },
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

    const { data: sub } = client.auth.onAuthStateChange((_event, session) =>
      setStatus(toStatus(session)),
    );

    return () => sub.subscription.unsubscribe();
  }, []);

  return status;
}

export function SignIn() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function magicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || !email.trim()) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    if (err) setError(err.message);
    else setSent(true);
  }

  async function google() {
    if (!supabase) return;
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (err) setError(err.message);
  }

  return (
    <motion.div
      variants={rise}
      initial="hidden"
      animate="show"
      className="mx-auto flex min-h-dvh w-full max-w-[--max-content] flex-col justify-center px-6"
    >
      <h1 className="t-display text-ink">HaKaiTask</h1>
      <p className="mt-3 text-[16px] font-medium leading-6 text-ink70">
        Masuk buat nyimpen task kamu lintas perangkat. Datanya tetap ada di HP dan
        laptop walau lagi offline.
      </p>

      {sent ? (
        <p className="mt-8 text-[15px] font-medium text-ink">
          Link masuk udah dikirim ke <span className="text-ink70">{email}</span>. Cek
          email kamu.
        </p>
      ) : (
        <>
          <form onSubmit={magicLink} className="mt-8">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email kamu"
              className="w-full rounded-[--radius-md] border-2 border-ink bg-transparent px-4 py-3 text-[16px] font-medium text-ink outline-none placeholder:text-ink40"
            />
            <motion.button
              type="submit"
              whileTap={press}
              disabled={busy}
              className="btn-pill mt-3 w-full disabled:opacity-40"
            >
              {busy ? "Mengirim…" : "Kirim link masuk"}
            </motion.button>
          </form>

          <motion.button
            type="button"
            whileTap={press}
            onClick={() => void google()}
            className="btn-pill-outline mt-3 w-full"
          >
            Lanjut dengan Google
          </motion.button>
        </>
      )}

      {error && <p className="mt-4 text-[15px] text-accent">{error}</p>}
    </motion.div>
  );
}
