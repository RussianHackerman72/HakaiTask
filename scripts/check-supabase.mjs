/**
 * Cek setelan Supabase — jalanin sesudah bikin project & jalanin migrasi.
 *
 *   node scripts/check-supabase.mjs
 *
 * Yang dicek ada empat, urut dari yang paling sering salah:
 *   1. .env.local kebaca dan isinya bukan placeholder
 *   2. Servernya kejangkau pakai kunci itu
 *   3. Semua tabel yang dipakai klien ada
 *   4. RLS beneran nyala — ini yang paling penting dan paling gampang
 *      kelewat: tanpa login, SELECT harus balik KOSONG, bukan error dan
 *      bukan isi. Kalau ada isinya, datanya kebuka ke publik.
 *
 * Sengaja pakai kunci publishable doang — sama persis kayak yang dipegang app.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function env() {
  let raw;
  try {
    raw = readFileSync(join(root, ".env.local"), "utf8");
  } catch {
    return null;
  }
  const out = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const ok = (m) => console.log("  OK   " + m);
const bad = (m) => console.log("  GAGAL " + m);

const e = env();
console.log("\n1. .env.local");
if (!e) {
  bad("gak ketemu di akar repo. Salin .env.example jadi .env.local.");
  process.exit(1);
}
const url = e.VITE_SUPABASE_URL;
const key = e.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || url.includes("<project-ref>")) {
  bad("VITE_SUPABASE_URL masih placeholder.");
  process.exit(1);
}
if (!key || key.includes("xxxx")) {
  bad("VITE_SUPABASE_PUBLISHABLE_KEY masih placeholder.");
  process.exit(1);
}
if (/service_role|^eyJ/.test(key) && key.length > 200) {
  bad("itu kelihatannya service_role / JWT lama. JANGAN dipakai di klien.");
  process.exit(1);
}
ok(url);

const db = createClient(url, key, { auth: { persistSession: false } });

console.log("\n2. Koneksi & tabel");
const TABLES = [
  "tasks",
  "busy_blocks",
  "user_lexicon",
  "focus_sessions",
  "projects",
  "user_settings",
];
let missing = 0;
for (const t of TABLES) {
  // `*`, bukan `id`: user_settings kuncinya `user_id` dan gak punya kolom `id`
  // sama sekali, jadi nanya `id` bikin tabel yang sehat kelihatan rusak.
  const { error } = await db.from(t).select("*", { count: "exact", head: true });
  if (error && /does not exist|schema cache/i.test(error.message)) {
    bad(`${t} — belum ada. Migrasinya udah dijalanin semua?`);
    missing++;
  } else if (error && !/permission|policy|RLS/i.test(error.message)) {
    bad(`${t} — ${error.message}`);
    missing++;
  } else {
    ok(t);
  }
}

console.log("\n3. Kolom yang dibutuhin sync");
for (const t of ["tasks", "busy_blocks", "user_lexicon", "focus_sessions"]) {
  const { error } = await db.from(t).select("updated_at,deleted_at").limit(1);
  if (error && /column .* does not exist/i.test(error.message)) {
    bad(`${t} — kurang updated_at/deleted_at. Migrasi 0002/0003 belum jalan?`);
    missing++;
  } else {
    ok(`${t}.updated_at + deleted_at`);
  }
}

console.log("\n4. RLS (tanpa login harus KOSONG, bukan error, bukan isi)");
let leaked = 0;
for (const t of TABLES) {
  const { data, error } = await db.from(t).select("*").limit(1);
  if (error) {
    ok(`${t} — ditolak (${error.code ?? "policy"})`);
  } else if (data && data.length > 0) {
    bad(`${t} — KEBACA TANPA LOGIN. RLS-nya belum nyala!`);
    leaked++;
  } else {
    ok(`${t} — kosong`);
  }
}

console.log("");
if (missing || leaked) {
  console.log(`Belum beres: ${missing} masalah skema, ${leaked} tabel kebuka.`);
  process.exit(1);
}
console.log("Semua aman. Sync siap dipakai.\n");
