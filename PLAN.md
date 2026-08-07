# HaKaiTask — Planning Document

Personal to-do list untuk web + Android (APK).
Dokumen ini acuan tunggal sebelum & selama development.

- **Status:** Fase 1 selesai — MVP web jalan di `apps/web`, 49 test lolos
- **Terakhir diperbarui:** 7 Agustus 2026
- **Pemilik:** Kai

---

## 1. Tujuan

Bikin to-do list personal yang **menjawab satu pertanyaan setiap kali dibuka**: _"apa yang harus gue kerjain sekarang?"_

Bukan aplikasi manajemen proyek. Bukan tempat nyimpen 200 task. Satu layar, satu jawaban, dengan konteks secukupnya.

**Prinsip desain:**

1. **Satu fokus.** Dashboard nampilin SATU task utama, bukan daftar panjang yang bikin lumpuh.
2. **Offline-first.** Nyentang task gak boleh nunggu internet. Local dulu, sync belakangan.
3. **Cepat masuk.** Nambah task harus < 5 detik. Kalau ribet, gak akan kepakai.
4. **Tenang.** Minimalis hitam-putih. Hirarki dari ukuran & jarak, bukan warna.
5. **Gak nge-judge.** Task keteteran naik prioritas pelan-pelan, bukan dikasih badge merah "OVERDUE!!!".

**Non-goals (sengaja gak dikerjain):**

- Kolaborasi / multi-user / sharing
- Kanban board, Gantt, sprint
- iOS build (Android + web dulu)
- **Integrasi kalender eksternal** (Google Calendar dll) — dibatalkan, lihat §11

---

## 2. Keputusan Arsitektur

### 2.1 Kenapa monorepo split (Opsi B)

`reactbits.dev`, `smoothui.dev`, `Lenis`, dan `Framer Motion` semuanya **React DOM** — butuh `div`, CSS, dan `window`. React Native gak punya itu. Jadi satu codebase universal Expo berarti kehilangan semua library animasi itu.

Solusinya: **logic ditulis sekali, UI ditulis dua kali.**

- `packages/core` — semua otak aplikasi, nol UI. Dipakai web & mobile.
- `apps/web` — bebas pakai reactbits, smoothui, Lenis, Framer Motion.
- `apps/mobile` — Expo + Reanimated 3 + Moti, terasa native beneran.

Karena mayoritas kompleksitas ada di scoring, sync, dan parsing — bukan di UI — duplikasi UI-nya masih sepadan.

### 2.2 Struktur repo

```
hakaitask/
├─ package.json                  # pnpm workspace root
├─ pnpm-workspace.yaml
├─ turbo.json
├─ PLAN.md
├─ packages/
│  ├─ core/                      # otak aplikasi — ZERO import UI
│  │  ├─ types.ts                # Task, Project, Tag, Occurrence
│  │  ├─ scoring.ts              # mesin prioritas
│  │  ├─ parser/                 # quick-add bahasa alami (100% lokal)
│  │  │  ├─ index.ts             #   pipeline 9 langkah
│  │  │  ├─ lexicon.id.json      #   KAMUS — slang, niat, partikel
│  │  │  ├─ datetime.ts          #   tanggal & jam Indonesia
│  │  │  └─ parser.test.ts       #   suite test §6.1.9
│  │  ├─ recurrence.ts           # ekspansi RRULE
│  │  ├─ store/                  # Zustand slices + persist adapter
│  │  └─ sync/                   # Supabase client, outbox queue
│  └─ tokens/                    # design token (warna, spacing, type scale, motion)
│                                # export ke CSS vars (web) + JS object (native)
├─ apps/
│  ├─ web/                       # Vite + React + TS + Tailwind
│  └─ mobile/                    # Expo (SDK terbaru) + Expo Router
└─ supabase/
   └─ migrations/
```

Gak ada `supabase/functions/` — tanpa integrasi kalender, gak ada lagi yang butuh jalan di server. Supabase dipakai murni sebagai database + auth.

**Aturan keras:** `packages/core` gak boleh import apa pun dari `react`, `react-native`, atau DOM. Murni TypeScript + Zustand. Ini yang bikin dia bisa dipakai di dua tempat dan gampang di-test.

### 2.3 Stack

| Layer | Pilihan | Alasan |
|---|---|---|
| Monorepo | pnpm workspace + Turborepo | Standar, cepat, gak ribet |
| Bahasa | TypeScript strict | Wajib |
| State | Zustand + `persist` | Ringan, gampang di-share lintas platform |
| Local storage | `localStorage` (web) / `AsyncStorage` (mobile) | Via adapter di core |
| Backend | Supabase | Postgres + Auth + Realtime buat sync lintas device. Free tier cukup |
| Auth | Supabase Auth — Google sign-in atau magic link | Cuma buat identitas. **Tanpa scope kalender** |
| Styling web | Tailwind CSS | Dibutuhin reactbits/smoothui |
| Styling mobile | StyleSheet + token dari `packages/tokens` | Hindari NativeWind biar gak nambah lapisan |
| Animasi web | Framer Motion + reactbits + smoothui | Sesuai keinginan |
| Smooth scroll web | Lenis (`lerp: 0.09`) | Halus tanpa bikin mual |
| Animasi mobile | Reanimated 3 + Moti | Standar de-facto, 60fps di UI thread |
| Navigasi mobile | Expo Router | File-based, mirip web |
| Notifikasi | `expo-notifications` (local) | Gak perlu push server dulu |
| Deploy web | Vercel | Gratis, gampang |
| Build APK | EAS Build (profile `preview` → APK) | Gak perlu Android Studio |

### 2.4 Kenapa offline-first

To-do list yang gagal nyentang task karena sinyal jelek = to-do list yang ditinggalin. Jadi:

- Semua mutasi tulis ke **local store dulu**, langsung, optimistik.
- Setiap mutasi masuk **outbox queue** (array persisted).
- Worker sync nge-drain outbox pas online.
- Konflik diselesaikan **last-write-wins berdasarkan `updatedAt`** per field. Cukup buat single-user.
- Supabase Realtime nge-push perubahan dari device lain masuk ke store.

---

## 3. Data Model

### 3.1 Tipe inti

```ts
type Priority = 1 | 2 | 3 | 4;          // 1 = paling urgent
type Status   = 'todo' | 'doing' | 'done' | 'archived';
type Energy   = 'low' | 'medium' | 'high';

interface Task {
  id: string;                    // uuid, dibuat di client
  userId: string;

  title: string;
  notes?: string;                // markdown
  status: Status;
  priority: Priority;

  // waktu
  dueAt?: string;                // ISO — deadline
  startAt?: string;              // ISO — kapan mulai dikerjain
  allDay: boolean;
  estimateMin?: number;          // estimasi durasi
  actualMin?: number;            // hasil akumulasi focus timer

  // konteks
  energy?: Energy;               // butuh tenaga seberapa
  projectId?: string;
  tags: string[];

  // notifikasi & review
  reminderMin?: number;          // notif T-minus sekian menit sebelum dueAt
  rescheduleCount: number;       // berapa kali digeser — sinyal "keteteran"

  // struktur
  subtasks: Subtask[];
  blockedBy?: string[];          // id task lain

  // pengulangan
  recurrence?: string;           // RRULE, mis. "FREQ=WEEKLY;BYDAY=MO,WE,FR"
  recurrenceParentId?: string;   // occurrence nunjuk ke template-nya

  // sinkronisasi
  syncState: 'local' | 'synced' | 'pending' | 'conflict';

  // audit
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  snoozedUntil?: string;
}

interface Subtask {
  id: string;
  title: string;
  done: boolean;
  order: number;
}

interface Project {
  id: string;
  userId: string;
  name: string;
  archived: boolean;
  order: number;
}

interface UserSettings {
  userId: string;

  // time blocking
  workdayStart: string;          // "08:00"
  workdayEnd: string;            // "22:00"
  slotMin: 15 | 30;              // granularitas grid timeline

  // energy
  energyMode: Energy | 'auto';   // 'auto' = ditebak dari jam & sesi fokus

  // focus timer
  pomodoroWorkMin: number;       // default 25
  pomodoroBreakMin: number;      // default 5

  // notifikasi
  morningBriefAt?: string;       // "07:00", null = mati
  weeklyReviewAt?: string;       // "SUN 19:00", null = mati
  defaultReminderMin: number;    // default 60
  quietHours: [string, string];  // ["22:00", "06:00"]
  maxNotifPerDay: number;        // default 4

  // estimasi
  estimateMultiplier: number;    // dihitung dari histori, dipakai buat saran
}
```

### 3.2 Skema Supabase

```sql
-- tasks
create table tasks (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  notes text,
  status text not null default 'todo',
  priority smallint not null default 3,
  due_at timestamptz,
  start_at timestamptz,
  all_day boolean not null default false,
  estimate_min integer,
  actual_min integer,
  energy text,
  project_id uuid references projects(id) on delete set null,
  tags text[] not null default '{}',
  subtasks jsonb not null default '[]',
  blocked_by uuid[] not null default '{}',
  recurrence text,
  recurrence_parent_id uuid references tasks(id) on delete cascade,
  reminder_min integer,
  reschedule_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  snoozed_until timestamptz
);

create index tasks_user_due   on tasks (user_id, due_at) where status <> 'archived';
create index tasks_user_stat  on tasks (user_id, status);

-- projects
create table projects (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  archived boolean not null default false,
  "order" integer not null default 0
);

-- blok sibuk: jadwal tetap yang bukan task, cuma nutup slot waktu (§6.2)
create table busy_blocks (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  recurrence text
);

create index busy_user_time on busy_blocks (user_id, start_at);

-- kamus pribadi: kata yang diajarin user ke parser (§6.1.7)
create table user_lexicon (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  dari text not null,          -- token yang gak dikenali
  ke text not null,            -- bentuk bakunya
  tipe text not null,          -- 'slang' | 'niat' | 'partikel' | 'buang'
  created_at timestamptz not null default now(),
  unique (user_id, dari)
);

-- log sesi focus timer — sumber data untuk statistik & kalibrasi estimasi
create table focus_sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid references tasks(id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz,
  minutes integer,
  interruptions integer not null default 0,
  mode text not null default 'pomodoro'   -- 'pomodoro' | 'stopwatch'
);

create index focus_user_time on focus_sessions (user_id, started_at desc);

-- preferensi user (satu baris per user)
create table user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  workday_start time not null default '08:00',
  workday_end time not null default '22:00',
  slot_min smallint not null default 30,
  energy_mode text not null default 'auto',
  pomodoro_work_min smallint not null default 25,
  pomodoro_break_min smallint not null default 5,
  morning_brief_at time default '07:00',
  weekly_review_at text default 'SUN 19:00',
  default_reminder_min integer not null default 60,
  quiet_hours text[] not null default '{22:00,06:00}',
  max_notif_per_day smallint not null default 4,
  estimate_multiplier numeric not null default 1.0
);

-- snapshot hasil review mingguan
create table weekly_reviews (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  completed_count integer not null default 0,
  focus_minutes integer not null default 0,
  slipped_task_ids uuid[] not null default '{}',
  next_week_focus uuid[] not null default '{}',   -- maks 3 task
  note text,
  created_at timestamptz not null default now(),
  unique (user_id, week_start)
);
```

**RLS:** aktifkan di semua tabel, policy `auth.uid() = user_id` untuk select/insert/update/delete. Karena gak ada lagi rahasia sisi server (token pihak ketiga dsb), semua tabel bisa diakses langsung dari client — service role key gak dibutuhin sama sekali.

---

## 4. Mesin Prioritas

Ini jantungnya. "Munculin yang paling deket / paling urgent" bukan sekadar `ORDER BY due_at`.

### 4.1 Formula

```
score(task) =
    3.0 × urgency(dueAt)
  + 2.0 × priorityWeight(priority)
  + 1.0 × agingBonus(createdAt)
  + 1.5 × startedBonus(status)
  + 0.5 × quickWinBonus(estimateMin)
  + 1.2 × energyMatch(task.energy, modeEnergiSekarang)
  − 5.0 × blockedPenalty(blockedBy)
  − 99  jika snoozedUntil > sekarang
```

**`urgency(dueAt)` — naik eksponensial mendekati deadline:**

| Sisa waktu | Nilai |
|---|---|
| Lewat deadline | 1.0 (maksimum) |
| < 2 jam | 0.95 |
| Hari ini | 0.80 |
| Besok | 0.55 |
| Dalam 3 hari | 0.35 |
| Dalam seminggu | 0.20 |
| > seminggu | 0.08 |
| Tanpa deadline | 0.10 |

**`priorityWeight`:** P1 = 1.0, P2 = 0.65, P3 = 0.35, P4 = 0.15

**`agingBonus`:** `min(umurHari / 30, 1.0)`
→ task yang lo hindarin 2 minggu naik pelan-pelan sampai akhirnya muncul di atas. Anti-procrastination tanpa nge-nyinyir.

**`startedBonus`:** 1.0 kalau `status === 'doing'`, 0 selain itu.
→ selesaikan yang udah dimulai.

**`quickWinBonus`:** 1.0 kalau `estimateMin <= 15`.
→ task 5 menit gak boleh ngendon berminggu-minggu.

**`energyMatch`:** lihat §6.6. Nilai 1.0 kalau energi task cocok sama mode sekarang, 0.4 kalau selisih satu tingkat, 0 kalau berlawanan. Bobotnya (1.2) sengaja lebih kecil dari urgency — jadi **energi cuma menggeser urutan, gak pernah nyembunyiin task yang beneran mendesak.**

**`blockedPenalty`:** 1.0 kalau ada `blockedBy` yang belum `done`.

### 4.2 Pemilihan Focus Task

```
1. Ambil semua task status 'todo' | 'doing', gak di-snooze
2. Hitung score, urutkan desc
3. Focus Task = peringkat 1
4. Upcoming list = peringkat 2..6
5. Kalau kosong → cari task terdekat yang dijadwalkan di masa depan
   → "Tugas mendatang untuk mu adalah ngopi bareng Reo hari Minggu"
6. Kalau bener-bener kosong → empty state
```

### 4.3 Aturan sapaan

| Jam | Sapaan |
|---|---|
| 04:00–10:59 | Selamat pagi |
| 11:00–14:59 | Selamat siang |
| 15:00–17:59 | Selamat sore |
| 18:00–03:59 | Selamat malam |

Format: `{sapaan}, Kai.` lalu baris kedua:
- Ada task hari ini → "Tugas kamu hari ini adalah"
- Gak ada hari ini, ada mendatang → "Tugas mendatang untuk mu adalah"
- Semua kelar → "Hari ini kamu bebas."

---

## 5. Fitur

### 5.1 Fase 1 — MVP (harus ada biar app-nya kepakai)

| # | Fitur | Catatan |
|---|---|---|
| 1 | Dashboard + Focus Card | Sapaan dinamis, 1 task utama, 3–5 upcoming |
| 2 | Detail sheet | Klik focus card → sheet naik: notes, subtask, aksi |
| 3 | CRUD task | Bikin, edit, selesai, hapus, arsip |
| 4 | **Quick add bahasa alami** | Berbasis kamus, 100% lokal — spec lengkap §6.1 |
| 5 | Snooze cepat | "besok" · "akhir pekan" · "minggu depan" |
| 6 | Offline-first + outbox | Non-negotiable |
| 7 | Auth (Supabase) | Google sign-in atau magic link — identitas doang |
| 8 | Dark mode | Invert token, ikut sistem |
| 9 | Command palette `Ctrl/Cmd+K` | Web only. Bikin kerasa premium instan |

**Quick-add nerima dua gaya, dua-duanya diparse lokal (§6.1):**

```
kalimat biasa   "ingetin gw bsk jam 2 ada rapat sama klien"
bertanda        "rapat klien besok jam 2 !p1 #kerja 60m"
campur          "masukin jadwal rapat klien bsk jam 2 !p1"
```

### 5.2 Fase 2 — Fokus & Data

| # | Fitur | Spec |
|---|---|---|
| 10 | **Focus mode + Pomodoro** | §6.3 |
| 11 | **Statistik** — heatmap, streak, estimasi vs aktual, jam produktif | §6.5 |
| 12 | **Energy matching** + toggle dashboard | §6.6 |

### 5.3 Fase 3 — Mobile

| # | Fitur | Spec |
|---|---|---|
| 13 | Semua layar fase 1–2 di Expo | §2.1 |
| 14 | **Notifikasi lokal** — reminder deadline, timer, tertunggak | §6.7 |
| 15 | **Morning brief** harian jam 07:00 | §6.7 |
| 16 | Swipe gesture: geser kanan = selesai, kiri = snooze | §7.4 |
| 17 | Build APK via EAS | §2.3 |

### 5.4 Fase 4 — Perencanaan

| # | Fitur | Spec |
|---|---|---|
| 18 | **Time blocking / Today Plan** + isi otomatis | §6.2 |
| 19 | **Review mingguan** | §6.4 |
| 20 | Recurring task | §6.9 |

### 5.5 Backlog (belum dikomit)

| # | Fitur | Catatan |
|---|---|---|
| 21 | Someday / Maybe | Buangan ide biar gak ganggu view harian |
| 22 | Template task | "Produksi Vlog" → auto 6 subtask |
| 23 | Share target Android | Share link YouTube → langsung jadi task |
| 24 | Impor `.ics` read-only | Alternatif ringan kalau nanti kepengin lihat jadwal luar (§11.1) |
| 25 | Ekspor feed `.ics` | Task HaKaiTask kebaca dari app kalender lain, satu arah |

**8 fitur berikut statusnya committed** dan dispesifikasi lengkap di §6:
quick-add NL (§6.1), time blocking (§6.2), focus/pomodoro (§6.3), review mingguan (§6.4),
statistik (§6.5), energy matching (§6.6), notifikasi (§6.7), offline-first (§6.8).

---

## 6. Spesifikasi Fitur Utama

Delapan fitur di bawah ini statusnya **committed**. Semuanya punya konsekuensi ke data model atau scoring, jadi dispesifikasi di depan meskipun implementasinya bertahap.

---

### 6.1 Quick Add Natural Language

**Kenapa prioritas MVP:** friksi nambah task adalah satu-satunya alasan terbesar to-do app ditinggalin. Target: dari niat sampai task tersimpan **< 5 detik**, tanpa nyentuh form.

**Tata bahasa**

```
revisi vlog besok jam 2 !p1 #konten @youtube 90m
└──────┬──────┘└───┬───┘└┬┘└──┬─┘└───┬──┘└─┬─┘
    judul       waktu   prio  tag  proyek durasi
```

| Token | Bentuk yang dikenali | Hasil |
|---|---|---|
| Tanggal relatif | `hari ini`, `besok`, `lusa`, `minggu depan`, `akhir pekan` | `dueAt` |
| Nama hari | `senin`..`minggu`, `senin depan` | hari terdekat ke depan |
| Tanggal eksplisit | `25 des`, `25/12`, `25 desember` | tahun ditebak ke depan |
| Jam | `jam 2`, `jam 14`, `14:00`, `2 siang`, `jam 8 malam` | jam pada `dueAt` |
| Rentang | `jam 2-4`, `jam 14 sampai 16` | `startAt` + `estimateMin` |
| Prioritas | `!p1`..`!p4`, `!!` = p1, `!` = p2 | `priority` |
| Tag | `#konten` | `tags[]` (boleh banyak) |
| Proyek | `@youtube` | `projectId` (dibuat kalau belum ada) |
| Durasi | `90m`, `1.5j`, `2 jam`, `45 menit` | `estimateMin` |
| Energi | `~ringan`, `~sedang`, `~berat` | `energy` |
| Pengulangan | `tiap senin`, `tiap hari`, `tiap hari kerja`, `tiap 2 minggu` | RRULE |
| Blok sibuk | `%sibuk` | Bikin `BusyBlock`, bukan task (§6.2) |

**Catatan teknis penting:** `chrono-node` (parser tanggal NL paling populer) **gak punya locale Bahasa Indonesia**. Jadi parser tanggalnya kita tulis sendiri di `packages/core/parser/`. Ini kerjaan sehari, bukan seminggu — kosakata tanggal Indonesia terbatas dan sangat teratur.

**Keputusan: parsing 100% lokal, tanpa AI.** Semua kecerdasan parser berasal dari **kamus** (`lexicon.id.json`) dan aturan, dijalankan di device. Alasannya di §11.2. Konsekuensinya: kamus harus tebal, dan harus gampang ditambahin.

---

#### 6.1.1 Pipeline

```
input string
  ↓ ① NORMALISASI      lowercase buat pencocokan (judul simpan casing asli)
  ↓                    slang → baku (kamus A)
  ↓ ② NIAT             cabut kata perintah, tebak jenis (kamus B)
  ↓ ③ SAMPAH           buang partikel & kata pengisi (kamus C)
  ↓ ④ TOKEN BERTANDA   !p #tag @proyek ~energi %sibuk +subtask //catatan *ingat
  ↓ ⑤ DURASI           pola angka + satuan
  ↓ ⑥ PENGULANGAN      "tiap ..."  ← WAJIB sebelum tanggal
  ↓ ⑦ TANGGAL          relatif → nama hari → eksplisit
  ↓ ⑧ JAM              tunggal → rentang → perkiraan
  ↓ ⑨ JUDUL            sisa teks, dirapiin, huruf pertama dibesarkan
  → { task, kind, matchedRanges[], unmatched[] }
```

**Urutan langkah 6 sebelum 7 itu wajib.** Kalau tanggal diparse duluan, `tiap senin` bakal kebaca sebagai tanggal "senin" dan pengulangannya hilang.

**`matchedRanges`** dipakai buat nyorot bagian input yang keparsing. **`unmatched`** berisi potongan yang gak dikenali — ditampilkan dengan garis bawah putus-putus, dan **dicatat ke log lokal** buat bahan nambah kamus (§6.1.7).

---

#### 6.1.2 Kamus A — Slang → Baku

File: `packages/core/parser/lexicon.id.json`. Ini kamus utama dan yang paling sering ditambahin.

**Waktu**
```
tar, ntar, nti, nanti2         → nanti
bsk, bsok, besuk, bsk pagi     → besok
lusa, besok lusa               → lusa
kmrn, kemaren                  → kemarin
skrg, skrang, skg, now         → sekarang
tgl, tanggl                    → tanggal
jm, jem                        → jam
mgu, minggu depan → mgg dpn    → minggu
bln, buln                      → bulan
thn, taun                      → tahun
mnt, menitan                   → menit
weekend, wiken, wknd           → akhir pekan
senen, senin2                  → senin
slasa, selase                  → selasa
rabo                           → rabu
kemis, kamis2                  → kamis
jumat, jum'at, jumaat          → jumat
sabtuan, saptu                 → sabtu
minggon, minggu2               → minggu
```

**Waktu dalam hari**
```
pagi2, pagi-pagi, subuhan      → pagi
siangan, siang2                → siang
sorean, sore2                  → sore
malem, malam2, mlm             → malam
abis subuh                     → 05:30
abis magrib                    → 18:30
abis isya                      → 19:30
tengah malam                   → 00:00
tengah hari                    → 12:00
```

**Kata ganti & kepemilikan** — semuanya **dibuang**, bukan diterjemahkan
```
gw, gue, gua, aku, saya, ane, aq, w
gw'a, gwe, akuu
mu, ku, nya (sebagai akhiran berdiri sendiri)
```

**Kata kerja bantu & penghubung** — dibuang
```
ad, ada, ade                   → «buang»
mau, mo, pengen, pgn, kepengen → «buang»
harus, kudu, mesti, wajib      → «buang» (tapi naikkan prioritas ke P2)
udah, udh, dah, sdh            → «buang»
blm, belom, belum              → «buang»
lg, lagi                       → «buang»
sm, sama, ama, bareng          → «buang» kalau di depan nama orang
ke, di, dari, buat, bwt, utk   → «buang» kalau berdiri sendiri di ujung
```

**Singkatan umum**
```
dl, dulu                       → «buang»
dr, drpd                       → daripada
krn, karna, karena             → «buang»
klo, kalo, kl                  → «buang»
jgn, jangan                    → «buang»
tp, tapi                       → «buang»
dg, dgn, dengan                → «buang»
sblm, sebelom                  → sebelum
stlh, setelah, abis, habis     → setelah
sampe, smp, sampai, s/d, sd    → sampai
```

**Angka & durasi**
```
setengah jam                   → 30 menit
seperempat jam                 → 15 menit
sejam, 1 jam                   → 60 menit
sehari                         → 480 menit (1 hari kerja)
bentar, sebentar, bentaran     → 15 menit
lama, lamaan                   → «abaikan» (terlalu kabur — jangan nebak)
```

**Perkiraan** — nandain jam yang gak presisi
```
an (akhiran: "jam 3an")        → perkiraan
sekitar, sktr, sekitaran       → perkiraan
kurleb, kurang lebih, kira2    → perkiraan
kisaran                        → perkiraan
```

---

#### 6.1.3 Kamus B — Kata Perintah & Deteksi Niat

Kata-kata ini **dicabut dari judul** dan sekaligus jadi sinyal jenis apa yang mau dibikin.

| Kata perintah | Hasil |
|---|---|
| `masukin jadwal`, `jadwalin`, `jadwal`, `catat jadwal`, `masukin ke kalender` | **BusyBlock** |
| `ingetin`, `ingatkan`, `remind`, `reminder`, `jangan lupa`, `jgn lupa`, `alarm` | **Task** + reminder aktif |
| `tambahin`, `tambah`, `bikin`, `buat`, `bikinin`, `catat`, `note`, `simpen` | **Task** (netral) |
| `todo`, `tugas`, `task` | **Task** (netral) |
| `tolong`, `plis`, `pls`, `coba` | «buang», gak ngaruh |

**Kata benda yang nandain jadwal** — kalau muncul sebagai judul dan ada jam pasti, tebak **BusyBlock**:
```
rapat, meeting, mikung, zoom, gmeet, google meet, call, vc
kelas, kuliah, seminar, webinar, workshop, training
janjian, ketemu, ketemuan, nongkrong, ngopi, makan siang, makan malam
acara, undangan, kondangan, wisuda, ultah
interview, wawancara, sidang, presentasi
```

**Kata benda yang nandain tugas** — selalu **Task**:
```
revisi, edit, editing, render, export, upload
kirim, kirimin, bales, balesin, follow up, fu
beli, beliin, bayar, transfer, top up
nulis, tulis, draft, riset, research, baca
cek, ngecek, review, periksa
```

**Aturan tebakan:** ada kata perintah → ikut kata perintah. Gak ada → pakai kata benda. Dua-duanya gak ada → **Task** (default aman, karena task bisa diabaikan, jadwal palsu nutup slot waktu).

Tebakannya **selalu ditampilkan sebagai chip yang bisa diklik** — `[ Tugas ⇄ Jadwal ]`. Tebak, tampilin, jangan kunci.

---

#### 6.1.4 Kamus C — Partikel & Kata Pengisi

Dibuang tanpa efek apa pun. Ini yang bikin judul jadi bersih.

```
deh, dong, sih, tuh, nih, kok, kan, ya, yaa, yah, lho, loh, kek, gitu, gt
aja, aj, ajah, doang, doangan
banget, bgt, bener, beneran
tuh ya, gitu deh, gitu ya
yg, yang (kalau di ujung kalimat)
eh, hmm, oke, ok, oh
```

**Hati-hati:** partikel cuma dibuang kalau **berdiri sendiri sebagai kata**, bukan bagian kata lain. `"beli kaos kaki"` — `ki` bukan partikel. Pencocokan harus per-kata utuh (`\b`), bukan substring.

---

#### 6.1.5 Kamus D — Tata Bahasa Bertanda

Tetap didukung buat yang mau ngetik cepat, tapi **bukan lagi jalur utama**.

| Token | Bentuk | Hasil |
|---|---|---|
| Prioritas | `!p1`..`!p4`, `!!` = P1, `!` = P2 | `priority` |
| Tag | `#konten` | `tags[]` |
| Proyek | `@youtube` | `projectId` (chip nandain kalau baru) |
| Energi | `~ringan` / `~sedang` / `~berat` | `energy` |
| Subtask | `+cek audio +grading` | `subtasks[]` |
| Catatan | `// fokus di transisi` | `notes` |
| Reminder | `*30m`, `*1j` | `reminderMin` |
| Blok sibuk | `%sibuk` | paksa jadi `BusyBlock` |
| Literal | `"rapat besok"` | isi tanda kutip gak diparse |

---

#### 6.1.6 Aturan Waktu

**Jam ambigu → pilih yang masuk jendela kerja.** `jam 2` = 14:00, `jam 7` = 07:00, `jam 9` = 09:00, `jam 11` = 11:00. Buat jam dini hari, tulis eksplisit: `02:00` atau `jam 2 pagi`.

**Bentuk jam yang dikenali**
```
jam 2 · jam 14 · 14:00 · 14.00 · 2:00
2 siang · 8 malam · 7 pagi · 4 sore · 11 malam
setengah 3      → 14:30    ← khas Indonesia, wajib
setengah 8      → 07:30
jam 2 lewat 15  → 14:15
jam 3 kurang 10 → 14:50
jam 3an         → 15:00 + tanda perkiraan
```

**Rentang** (ngisi `startAt` + `estimateMin`)
```
jam 2-4 · jam 14 sampai 16 · jam 9 s/d 11 · dari jam 2 sampe jam 4
jam 9-9.15 · 09:00-09:15
```

**Tanggal relatif**
```
hari ini · besok · lusa · minggu depan · bulan depan
akhir pekan · akhir bulan · awal bulan
3 hari lagi · dalam 2 minggu · seminggu lagi · 2 hari lagi
```

**Nama hari**
```
"senin"       → senin terdekat ke depan (kalau hari ini Senin → Senin depan)
"senin ini"   → senin di minggu berjalan
"senin depan" → senin di minggu berikutnya
"senin besok" → sama dengan "senin depan"
```

**Tanggal eksplisit**
```
tgl 25 · 25/12 · 25-12 · 25 des · 25 desember · 25 desember 2027
```
Nama bulan lengkap + singkatan: `jan feb mar apr mei jun jul agu/ags sep okt nov des`

**Pengulangan**
```
tiap hari · tiap hari kerja · tiap weekday
tiap senin · tiap senin rabu jumat · tiap senin & kamis
tiap minggu · tiap 2 minggu · tiap bulan · tiap tanggal 25
setiap ... (sama persis dengan "tiap")
```

**Tahun gak pernah mundur.** `25 des` di bulan Agustus → Desember tahun ini. Di bulan Januari → Desember tahun ini juga, bukan tahun lalu.

**Ragu = jangan nebak.** Lebih baik task tanpa tanggal daripada task dengan tanggal salah yang gak kelihatan. Tanggal salah itu diam-diam merusak — task nongol di hari keliru dan lo baru sadar pas telat.

---

#### 6.1.7 Kamus yang Tumbuh Sendiri

Ini yang bikin pendekatan tanpa AI tetap menang dalam jangka panjang.

```
1. Tiap input yang punya `unmatched` dicatat ke log lokal
   { input, unmatchedTokens[], hasilParsing, dikoreksiManual?, waktu }
2. Kalau user ngoreksi chip, koreksinya ikut dicatat
   → ini sinyal paling berharga: kita tau apa yang SEHARUSNYA
3. Layar Setelan → "Kata yang belum dikenali"
   Nampilin daftar token yang sering muncul tapi gak keparsing,
   diurutkan by frekuensi
4. Tiap baris ada tombol "Ajarin" → pilih artinya
   → langsung masuk ke kamus pribadi (overlay di atas lexicon.id.json)
```

Setelah sebulan, kamusnya **bicara dengan gaya bahasa lo sendiri** — sesuatu yang model AI generik gak bisa kasih tanpa fine-tuning. Dan gratis, instan, jalan di pesawat.

Kamus pribadi disimpan di tabel `user_lexicon` (`user_id`, `dari`, `ke`, `tipe`) dan ikut sinkron lintas device.

---

#### 6.1.8 Tingkatan Implementasi

Jangan bikin semuanya sekaligus.

| Tingkat | Isi | Kapan |
|---|---|---|
| **1** | Kamus A (waktu + kata ganti + kata bantu), tanggal & jam relatif, `!` prioritas, durasi | Fase 0 |
| **2** | Kamus B (niat) + C (partikel), `#` `@` `+`, tanda kutip literal, `setengah 3`, rentang jam | Fase 1 |
| **3** | Kamus D sisanya, pengulangan, kamus tumbuh sendiri (§6.1.7) | Fase 1–2 |

Realitanya lo cuma bakal pakai 3–4 token bertanda. Yang paling nentuin bukan jumlah token, tapi **preview chip yang bagus** — selama hasil parsing kelihatan live dan tiap chip bisa diklik buat dikoreksi, parser 85% akurat pun tetap enak dipakai. Tanpa preview, parser 95% akurat tetap bikin was-was.

**UI**

Satu input field. Di bawahnya **preview live** — chip berisi hasil parsing yang update tiap ketikan:

```
┌────────────────────────────────────────────┐
│ revisi vlog besok jam 2 !p1 #konten 90m    │
└────────────────────────────────────────────┘
  Revisi vlog
  [ 8 Agu, 14.00 ]  [ P1 ]  [ #konten ]  [ 90 menit ]
                                    Enter untuk simpan
```

Chip bisa diklik buat koreksi manual. Bagian yang keparsing disorot halus (background `surface`) di dalam input — user langsung paham sintaksnya tanpa baca dokumentasi.

**Aturan aman:** kalau parser ragu, **jangan nebak**. Lebih baik jadi task tanpa tanggal daripada task dengan tanggal salah yang gak kelihatan.

#### 6.1.9 Test Case Wajib

Suite ini yang jadi patokan "kamusnya udah cukup atau belum" (`parser.test.ts`).

**Dasar**
```
"beli kopi"                             → judul saja, tanpa tanggal
"revisi vlog besok jam 2 !p1"           → besok 14:00, P1
"meeting senin jam 10-11 @kerja"        → Jadwal, Sen 10:00, estimate 60
"olahraga tiap senin rabu jumat"        → RRULE, tanpa dueAt
"bayar listrik tgl 25 !!"               → tgl 25, P1
"nulis draft 1.5j ~berat"               → estimate 90, energy high
"kirim email jam 8 malam"               → hari ini 20:00
```

**Kalimat gaul** — ini inti dari pendekatan berbasis kamus
```
"masukin jadwal gw tar lusa jam 3 an gw ada rapat"
  → Jadwal · "Rapat" · lusa 15:00 · perkiraan

"ingetin gw tgl 4 jam 1.20 gw ad zoom kelas"
  → Tugas · "Zoom kelas" · tgl 4 13:20 · reminder aktif

"jgn lupa bsk pagi bales email klien ya"
  → Tugas · "Bales email klien" · besok pagi · reminder aktif

"gw mau ngopi bareng reo hari minggu sore"
  → Jadwal · "Ngopi bareng reo" · Minggu 16:00
  (parser gak tau "reo" itu nama orang — cuma huruf pertama judul yang
   dibesarkan. Casing asli yang user ketik dipertahankan.)

"tambahin dong revisi video yg kemaren bentar aja"
  → Tugas · "Revisi video" · estimate 15

"kudu bayar kosan sblm tgl 5"
  → Tugas · "Bayar kosan" · tgl 5 · P2 (dari "kudu")

"setengah 8 malem ada kelas online tiap selasa"
  → Jadwal · "Kelas online" · 19:30 · RRULE tiap Selasa

"catat aja: riset kompetitor, sekitar 2 jaman"
  → Tugas · "Riset kompetitor" · estimate 120 · perkiraan
```

**Jebakan** — harus TIDAK salah parse
```
"meeting soal deadline besok"           → "besok" diparse tapi DISOROT
"\"rapat besok\" jam 2"                 → judul: rapat besok · hari ini 14:00
"beli kaos kaki"                        → "ki" BUKAN partikel; judul utuh
"beli tiket ke bali"                    → "ke" bukan di ujung, jangan dibuang
"jam 2 pagi berangkat"                  → 02:00, bukan 14:00
"minggu depan ketemu bu minggu"         → tanggal + nama orang, jangan bentrok
```

---

### 6.2 Time Blocking / Today Plan

**Konsep:** satu layar timeline harian. Kiri = jam, kanan = task & event. Task punya `startAt` + `estimateMin`, jadi blok punya posisi dan tinggi.

```
        SENIN, 11 AGUSTUS
 08.00  ┌──────────────────────────┐
        │  ░ Standup              │  ← blok sibuk, gak bisa ditimpa
 09.00  └──────────────────────────┘
        ┌ ── ── ── ── ── ── ── ── ┐
 10.00  │  celah 2j 30m           │  ← drop zone
        └ ── ── ── ── ── ── ── ── ┘
 11.00  ┌──────────────────────────┐
        │  Revisi video vlog       │  ← task, bisa digeser & diresize
 12.00  │  ~90 menit · P1          │
        └──────────────────────────┘
```

**Perhitungan celah**

```
1. Ambil jendela kerja dari user_settings (default 08:00–22:00)
2. Kumpulin blok terpakai:
     - busy_blocks hari itu (jadwal tetap yang diisi manual)
     - task yang udah punya startAt
3. Celah = jendela kerja dikurangi gabungan blok terpakai
4. Buang celah < 15 menit (gak berguna)
```

**Blok sibuk (`busy_blocks`)** — pengganti event kalender. Jadwal tetap yang bukan task dan gak perlu dicentang: kelas, standup, jam makan, komitmen rutin. Bikinnya sekali, bisa berulang (RRULE), fungsinya cuma satu: **nutup slot waktu** biar perhitungan celah jujur.

```ts
interface BusyBlock {
  id: string;
  userId: string;
  title: string;
  startAt: string;
  endAt: string;
  recurrence?: string;   // RRULE — "tiap hari kerja 09:00–09:15"
}
```

Bisa dibikin dari quick-add juga: `standup tiap hari kerja jam 9-9.15 %sibuk` (prefiks `%sibuk` menandai blok, bukan task).

**Interaksi**

| Aksi | Hasil |
|---|---|
| Drag task dari sidebar ke celah | Set `startAt`; `estimateMin` nentuin tinggi |
| Geser blok | Ubah `startAt` |
| Tarik tepi bawah | Ubah `estimateMin` (snap ke `slotMin`) |
| Drop di jam yang bentrok | Blok jadi merah + ditolak, disaranin celah terdekat |
| Tombol **"Isi otomatis"** | Ambil top-N by score, jejalin ke celah |

**Algoritma isi otomatis**

```
1. Kandidat = task 'todo'/'doing', punya estimateMin, belum punya startAt
2. Urutkan by score (§4.1)
3. Untuk tiap task, cari celah PERTAMA yang muat:
     - energy 'high'  → utamakan celah sebelum jam 13.00
     - energy 'low'   → utamakan celah setelah jam 15.00
     - quick win ≤15m → boleh nyempil di celah kecil
4. Sisipkan jeda 10 menit antar blok — jangan dijejal mepet
5. Berhenti kalau celah habis atau total > 6 jam kerja terjadwal
```

Batas 6 jam itu disengaja. Rencana yang menjadwalkan 11 jam kerja bukan rencana — itu bikin kecewa.

**Ketergantungan:** tidak ada. Semua datanya lokal — `busy_blocks` + task yang punya `startAt`. Ini justru bikin time blocking bisa maju ke fase lebih awal daripada rencana semula.

**Mobile:** drag-drop di layar kecil susah. Ganti jadi **tap task → "Jadwalkan" → pilih dari daftar celah yang disaranin**. Tetap enak, gak perlu gestur presisi.

---

### 6.3 Focus Mode + Pomodoro

**Layar fokus** — layar penuh, minimalis maksimal:

```
        ┌────────────────────────┐
        │                        │
        │   Revisi video vlog    │   ← serif, 28px
        │                        │
        │        24:13           │   ← mono, 72px, tabular
        │                        │
        │   ○ Cek audio          │   ← subtask, bisa dicentang
        │   ● Warna grading      │
        │   ○ Export             │
        │                        │
        │   [ jeda ]  [ selesai ]│
        │                        │
        │   sesi 2 · terganggu 1 │   ← mono 12px, ink-40
        └────────────────────────┘
```

**Mode**

| Mode | Pola |
|---|---|
| Pomodoro (default) | 25 kerja / 5 istirahat, tiap 4 sesi → istirahat 15 |
| Deep work | 50 / 10 |
| Stopwatch | Jalan bebas, gak ada target |

**Pencatatan**

- Tiap sesi masuk `focus_sessions` (`startedAt`, `endedAt`, `minutes`, `interruptions`, `mode`)
- `task.actualMin` = jumlah menit semua sesi terkait
- Ada tombol kecil **"terganggu"** — nambah `interruptions`, gak nyetop timer. Datanya jauh lebih jujur daripada cuma total waktu
- Ini yang jadi bahan mentah kalibrasi estimasi di §6.5

**Detail platform**

| | Web | Mobile |
|---|---|---|
| Layar nyala | `navigator.wakeLock` | `expo-keep-awake` |
| Timer jalan pas ditutup | Simpan `startedAt`, hitung selisih pas balik — **jangan andelin `setInterval`** | idem |
| Notif selesai | Notification API | `expo-notifications` |
| Timer di background | Judul tab jadi `24:13 · HaKaiTask` | Notifikasi ongoing (Android foreground-style) |

**Aturan:** timer **gak pernah** disimpan sebagai countdown yang jalan. Selalu `endsAt = startedAt + durasi`, sisa waktu dihitung dari jam sistem. Ini bikin dia kebal terhadap tab di-suspend, HP dikunci, atau app di-kill.

---

### 6.4 Review Mingguan

**Pemicu:** notifikasi Minggu 19:00 (bisa diatur). Bisa juga dibuka manual kapan aja.

**Alur 5 langkah** — dijalanin sebagai wizard, bukan satu halaman panjang:

**① Yang kelar** — perayaan, bukan laporan
```
Minggu ini kamu nyelesaiin 12 tugas.
Waktu fokus 6 jam 40 menit.
Hari paling produktif: Rabu.
```
Daftar task yang selesai, ringkas. Gak ada aksi, cuma dibaca.

**② Yang keteteran** — inti dari review
Kriteria: `dueAt` lewat DAN belum `done`, atau `rescheduleCount >= 2`.
Tiap task dapet 4 tombol aksi cepat:

| Tombol | Efek |
|---|---|
| Jadwalkan ulang | Pilih tanggal, `rescheduleCount++` |
| Turunkan prioritas | `priority + 1` |
| Pecah | Bikin subtask — biasanya keteteran karena kegedean |
| Arsip | Jujur aja, emang gak bakal dikerjain |

**③ Sinyal** — pengamatan otomatis, bukan omelan
```
· "Revisi vlog" udah digeser 4 kali. Kegedean, atau emang gak penting?
· Tag #konten paling banyak keteteran minggu ini.
· Estimasi kamu rata-rata 1,4× lebih cepat dari kenyataan.
```

**④ Minggu depan** — pilih **maksimal 3** task jadi fokus utama.
Batas 3 itu keras. Kalau semua penting, gak ada yang penting.

**⑤ Catatan** — satu textarea bebas, opsional.

Hasilnya disimpan ke `weekly_reviews`. Review lama bisa dibuka lagi — lama-lama jadi jurnal yang berguna.

**Nada bahasa:** deskriptif, bukan menghakimi. "Digeser 4 kali" bukan "Kamu gagal menyelesaikan ini". App yang bikin ngerasa bersalah bakal dihindari, dan to-do app yang dihindari itu gak ada gunanya.

---

### 6.5 Statistik Ringan

Semua dihitung **client-side** dari local store. Gak ada endpoint analitik, gak ada tabel agregat.

**a) Heatmap kontribusi** — grid 53×7, kotak 11px, gap 3px

Sengaja pas banget sama tema hitam-putih — 5 tingkat opasitas `ink`:

| Task selesai | Opasitas |
|---|---|
| 0 | 6% (nyaris kosong) |
| 1–2 | 25% |
| 3–4 | 45% |
| 5–7 | 70% |
| 8+ | 100% |

Hover → tooltip `"5 tugas · 12 Agu"`. Ini satu-satunya elemen yang boleh "ramai" di UI, dan justru jadi bagian paling memuaskan buat dilihat.

**b) Streak**
- Berjalan: hari berturut-turut dengan ≥1 task selesai
- Terpanjang: rekor sepanjang masa
- **Jeda santai:** streak gak putus kalau lo bolong 1 hari dalam 7 hari terakhir. Streak yang terlalu galak bikin stres, bukan bikin rajin

**c) Estimasi vs aktual** — ini yang paling berguna
```
rasio = actualMin / estimateMin, untuk task yang punya keduanya
estimateMultiplier = median 30 task terakhir
```
Ditampilin: **"Kamu biasanya butuh 1,4× lebih lama dari perkiraan."**
Lalu dipakai: pas ngetik estimasi di quick-add, app nyaranin angka yang udah dikoreksi. Ini fitur yang beneran ngubah cara lo ngerencanain.

**d) Jam produktif** — bar chart 24 jam dari `completedAt` + `focus_sessions`.
Output: "Paling produktif jam 10–12." Langsung nyambung ke §6.2 — isi otomatis bisa mentingin jam itu buat task berat.

**e) Distribusi** — pie/bar sederhana per proyek & tag. Nice to have, prioritas terakhir.

Semua chart digambar pakai SVG tangan sendiri. **Jangan pasang Recharts/Chart.js** — 5 chart sederhana gak sepadan sama 200KB bundle, dan chart bawaan library susah dibikin nyatu sama desain hitam-putih ini.

---

### 6.6 Energy Matching

**Field:** `Task.energy: 'low' | 'medium' | 'high'`

Diisi dari quick-add (`~ringan` / `~sedang` / `~berat`), atau ditebak: `estimateMin >= 90` → high, `<= 15` → low, selain itu medium.

**Kontrol di dashboard** — kecil, di pojok, gak menonjol:

```
ENERGI   ○ ─── ● ─── ○
       rendah sedang tinggi
```

**Efek ke scoring** (§4.1), bukan filter:

| Energi task | Mode rendah | Mode sedang | Mode tinggi |
|---|---|---|---|
| low | **1.0** | 0.4 | 0 |
| medium | 0.4 | **1.0** | 0.4 |
| high | 0 | 0.4 | **1.0** |

**Keputusan desain penting:** energi **menggeser urutan, bukan menyembunyikan task.** Bobotnya 1.2 sementara urgency 3.0 — jadi task P1 yang lewat deadline tetap nongol paling atas walaupun lo lagi capek. App gak boleh ngasih izin lo ngelewatin hal yang beneran mendesak.

**Mode auto** (default): ditebak dari jam + aktivitas hari itu.
```
06–11  → tinggi
11–14  → sedang
14–16  → rendah      (habis makan siang, jujur aja)
16–19  → sedang
19–22  → rendah
selalu → turun satu tingkat kalau udah > 3 sesi fokus hari ini
```
Bisa ditimpa manual kapan aja; override berlaku sampai tengah malam.

---

### 6.7 Notifikasi

**Jenis**

| Jenis | Kapan | Isi |
|---|---|---|
| Morning brief | 07:00 harian | "Selamat pagi, Kai. Hari ini: Revisi video vlog (+2 lagi)" |
| Reminder deadline | T−`reminderMin` (default 60m) | "Revisi video vlog jatuh tempo jam 14.00" |
| Review mingguan | Minggu 19:00 | "Waktunya lihat minggu ini" |
| Timer selesai | Sesi fokus habis | "Sesi selesai. Istirahat 5 menit?" |
| Ringkasan tertunggak | 20:00, maks 1×/hari | "3 tugas lewat deadline" |

**Aturan** — dilanggar sekali, notifikasi bakal dimatiin selamanya sama user:

1. Maksimal **4 notifikasi per hari** (di luar timer). Kelebihan → digabung jadi satu ringkasan.
2. **Jam tenang 22:00–06:00** — gak ada notif kecuali timer yang emang lagi jalan.
3. Semua notif **deep-link langsung ke task**-nya, bukan cuma ke halaman utama.
4. Tiap jenis bisa dimatiin sendiri-sendiri di setelan.
5. Jangan ada notif buat task yang udah selesai — batalin jadwalnya begitu di-`done`.

**Implementasi**

- **Mobile:** `expo-notifications`, semuanya lokal (gak perlu push server). Penjadwalan ulang dipicu tiap `dueAt`/`reminderMin`/status berubah. Android punya batas jumlah alarm terjadwal — **jadwalin cuma 7 hari ke depan**, refresh tiap kali app dibuka.
- **Web:** Notification API + service worker. Butuh app-nya dipasang sebagai PWA supaya notif jalan saat tab ketutup. Kalau gak, notif cuma muncul pas tab kebuka — masih berguna, tapi terbatas.
- Morning brief & review mingguan = notif berulang harian/mingguan, isinya dirakit saat itu juga dari local store.

---

### 6.8 Offline-first

Non-negotiable. Berikut mekanisme lengkapnya.

**Urutan boot**
```
1. Hidrasi Zustand dari local storage        (sinkron, ~10ms)
2. Render UI langsung                        ← JANGAN pernah nampilin spinner loading
3. Mulai sync di background
4. Update UI kalau ada perubahan dari server
```

**Amplop mutasi**
```ts
interface Mutation {
  id: string;                     // uuid, buat idempotensi
  entity: 'task' | 'project' | 'settings' | 'focus_session';
  entityId: string;
  op: 'create' | 'update' | 'delete';
  payload: Partial<Task>;         // cuma field yang berubah
  fieldTimes: Record<string, string>;  // waktu per field, buat LWW
  createdAt: string;
  attempts: number;
}
```

**Alur tulis**
```
User nyentang task
  → update store langsung (optimistik, UI berubah seketika)
  → push Mutation ke outbox (persisted)
  → kalau online: drain outbox
  → kalau offline: diem aja, outbox nunggu
```

**Drain outbox**
```
1. Kirim urut, satu per satu (jaga urutan sebab-akibat)
2. Sukses → buang dari outbox
3. Gagal jaringan → attempts++, backoff eksponensial (1s,2s,4s… maks 60s)
4. Gagal 4xx → tandai konflik, jangan diulang terus, kasih tau user
5. attempts > 10 → pindah ke dead-letter, munculin tombol "coba lagi"
```

**Resolusi konflik: last-write-wins per field**

Bukan per baris. Kalau HP ngubah `title` dan web ngubah `dueAt`, keduanya harus selamat. Tiap field bawa timestamp-nya sendiri; yang lebih baru menang. Buat satu user, ini lebih dari cukup — CRDT itu berlebihan di sini.

**Hapus** pakai tombstone (`deletedAt`), bukan hapus beneran. Dibersihin setelah 30 hari. Tanpa ini, hapus di HP bisa "hidup lagi" dari cache web.

**Realtime**: langganan Supabase Realtime pada `tasks`. Perubahan masuk digabung pakai aturan LWW yang sama, tapi **jangan pernah timpa entitas yang lagi ada di outbox** — perubahan lokal yang belum terkirim selalu menang.

**Indikator UI** — satu titik kecil di pojok:

| Kondisi | Tampilan |
|---|---|
| Semua tersinkron | titik `ink-40` samar |
| n menunggu | titik + `n` (mono, kecil) |
| Offline | titik kosong (outline) + tooltip "Offline — perubahan tersimpan" |
| Konflik | titik `accent` + bisa diklik |

Jangan pernah nampilin toast "Gagal menyimpan". Data-nya **gak** gagal disimpan — cuma belum tersinkron. Bahasanya harus benar, biar user gak panik dan ngetik ulang.

---

### 6.9 Recurring Task (pendukung)

Simpan RRULE di task template. Occurrence **dibuat malas** (lazy): waktu render, ekspansi RRULE 60 hari ke depan jadi occurrence virtual. Baru pas occurrence disentuh (dicentang/diedit/dijadwal ulang) dia jadi baris `tasks` beneran dengan `recurrenceParentId`.

Kenapa: mengulang "tiap hari" selama setahun = 365 baris untuk satu kebiasaan. Ekspansi malas bikin database tetap kecil dan pola gampang diedit.

Pakai `rrule` (npm) — kecil, dipakai di mana-mana, jalan di RN.

---

## 7. Design System

### 7.1 Warna

Jangan pure hitam/putih — terlalu keras di mata.

```
                LIGHT       DARK
ink             #0A0A0A     #FAFAFA     teks utama
ink-70          #525252     #A3A3A3     teks sekunder
ink-40          #A3A3A3     #6B6B6B     teks tersier / meta
line            #E5E5E5     #262626     border, divider
surface         #F4F4F4     #171717     card, elevated
paper           #FAFAFA     #0A0A0A     background
accent          #DC2626     #EF4444     HANYA overdue & P1
```

**Aturan:** `accent` cuma boleh dipakai buat overdue dan P1. Selain itu semua hirarki dibangun dari **ukuran, berat font, dan jarak**. Ini yang bikin minimalis kelihatan mahal, bukan murah.

### 7.2 Tipografi

| Peran | Font | Ukuran / Berat |
|---|---|---|
| Display (sapaan) | **Instrument Serif** | 40–52px / 400, tracking −0.02em |
| Heading | **Geist** | 20–28px / 600 |
| Body & UI | **Geist** | 15–16px / 400–500 |
| Meta / label | **Geist** | 12–13px / 500, tracking +0.04em, UPPERCASE |
| Angka & waktu | **Geist Mono** | 12–14px / 400, `tabular-nums` |

Alternatif serif: **Newsreader**. Alternatif sans: **Inter Tight**.
Semua tersedia di Google Fonts / Fontsource → jalan di web maupun Expo (`expo-font`).

### 7.3 Spacing & bentuk

- Skala spacing: `4 8 12 16 24 32 48 64 96`
- Radius: `8px` (kecil), `14px` (card), `24px` (sheet)
- Lebar konten maksimum: `640px` di web — sengaja sempit, biar fokus
- Border `1px solid line`. **Tanpa drop shadow** — pakai border & surface buat elevasi.

### 7.4 Motion

```
easing standar   cubic-bezier(0.22, 1, 0.36, 1)     // expo-out
easing masuk     cubic-bezier(0.16, 1, 0.3, 1)
durasi cepat     160ms   hover, tap
durasi normal    280ms   transisi elemen
durasi lambat    420ms   masuk halaman, sheet
stagger list     40ms
Lenis            lerp 0.09, duration 1.1, smoothWheel true
```

**Semua wajib hormatin `prefers-reduced-motion`** — kalau aktif, durasi jadi 0.

**Komponen animasi yang dipakai:**

| Elemen | Web (reactbits / smoothui) | Mobile (Reanimated / Moti) |
|---|---|---|
| Sapaan | Split text, blur-in, stagger per kata | `MotiText` fade + translateY, delay bertahap |
| Focus card | Fade + rise 12px, magnetic hover | `Animated.View` entering `FadeInDown` |
| List task | Animated list, stagger 40ms | `Layout` transition + stagger |
| Sheet detail | Framer `layoutId` morph dari card | `react-native-bottom-sheet` + shared element |
| Empty state | Shiny text / gradient sweep | Shimmer via Reanimated |
| Tombol | Magnetic + scale 0.97 saat tekan | `Pressable` + `withSpring` scale |

**Micro-interaction terpenting — animasi menyelesaikan task:**

```
1. Checkbox: garis centang digambar 180ms
2. Judul: strikethrough nge-swipe kiri→kanan 240ms
3. Seluruh card: fade + collapse height 320ms
4. Card berikutnya naik mengisi, spring
5. Mobile: haptic feedback ringan
```

Ini interaksi yang paling sering dilakuin. Kalau dia enak, app-nya bakal nagih.

### 7.5 Layout dashboard

```
┌──────────────────────────────────────┐
│  KAMIS, 7 AGUSTUS            07.05   │  mono 12px, ink-40, uppercase
│                                      │
│  Selamat pagi, Kai.                  │  serif 48px, ink
│  Tugas kamu hari ini adalah          │  sans 16px, ink-70
│                                      │
│  ┌────────────────────────────────┐  │
│  │ Revisi video vlog          →   │  │  sans 24px/600  ← FOCUS CARD
│  │ P1 · 14.00 · ~90 menit         │  │  mono 13px, ink-40
│  │ ▓▓▓▓▓▓░░░░  3/5                │  │  progress subtask
│  └────────────────────────────────┘  │
│                                      │
│  BERIKUTNYA                          │  meta label
│  ─────────────────────────────────   │
│  16.00   Meeting klien       sibuk   │
│  Besok   Kirim invoice          P2   │
│  Minggu  Ngopi bareng Reo            │
│                                      │
│                            ┌───┐     │
│                            │ + │     │  FAB / Ctrl+K
│                            └───┘     │
└──────────────────────────────────────┘
```

---

## 8. Roadmap

| Fase | Isi | Spec | Perkiraan |
|---|---|---|---|
| **0. Fondasi** | pnpm workspace + Turborepo, `packages/tokens`, `packages/core` (types, scoring, **parser NL**, store, **outbox**), Supabase project + migration + RLS, setup font | §2, §3, §4, §6.1, §6.8 | 2 hari |
| **1. MVP Web** | Dashboard + focus card, CRUD, **quick-add NL + preview chip**, detail sheet, snooze, dark mode, Lenis + motion pass, command palette, indikator sync, deploy Vercel | §6.1, §6.8, §7 | 4–5 hari |
| **2. Fokus & Data** | **Focus mode + Pomodoro**, `focus_sessions`, **statistik** (heatmap, streak, estimasi vs aktual), **energy matching** + toggle dashboard | §6.3, §6.5, §6.6 | 3 hari |
| **3. Mobile** | Expo Router, port UI ke Reanimated/Moti, swipe gesture, **notifikasi lokal + morning brief**, EAS Build → APK | §6.7 | 3–4 hari |
| **4. Perencanaan** | **Time blocking / Today Plan** + `busy_blocks` + isi otomatis, **review mingguan**, recurring task | §6.2, §6.4, §6.9 | 3–4 hari |
| **5. Backlog** | Someday/Maybe, template task, share target Android, impor/ekspor `.ics` | §5.5 | berkelanjutan |

**Kenapa urutannya begini:**

- **Parser NL & outbox masuk Fase 0**, bukan nanti. Keduanya logic murni di `packages/core`, gampang di-test tanpa UI, dan nempelin offline belakangan ke app yang udah jadi itu jauh lebih sakit daripada bangun dari awal.
- **Focus timer sebelum statistik** — statistik butuh data. Tanpa `focus_sessions` yang keisi beberapa minggu, "estimasi vs aktual" cuma grafik kosong.
- **Time blocking sekarang gak nunggu apa-apa.** Dulu ditaruh setelah Google Calendar karena butuh blok busy dari sana; sekarang datanya lokal (`busy_blocks`), jadi bisa dikerjain kapan aja. Ditaruh di Fase 4 murni karena review mingguan butuh temenan sama dia.
- **Review mingguan paling akhir** karena butuh `rescheduleCount` dan histori penyelesaian yang cukup buat menghasilkan sinyal yang berarti.

**Milestone kunci:** di akhir Fase 1 aplikasinya udah harus **beneran dipakai tiap hari**. Kalau enggak, ada yang salah di UX-nya — perbaiki dulu sebelum lanjut Fase 2.

---

## 9. Risiko & Mitigasi

| Risiko | Mitigasi |
|---|---|
| UI ditulis 2x jadi beban maintenance | `packages/core` nampung semua logic; komponen UI sengaja dibikin tipis & "bodoh" |
| Sync konflik antar device | Last-write-wins per field pakai `updatedAt`. Single-user, jadi konflik jarang |
| Scope creep — fitur nambah terus | Non-goals di §1 sifatnya mengikat. Ide baru masuk backlog §5.5 |
| Jadwal luar gak kelihatan (tanpa GCal) | `busy_blocks` diisi manual sekali + berulang; cukup buat perhitungan celah (§6.2) |
| Parser gak akurat buat kalimat gaul | Kamus tebal (§6.1.2–6.1.5) + kamus yang tumbuh dari koreksi user (§6.1.7); preview chip live; kalau ragu jangan nebak; suite test §6.1.9 |
| Kamus gak akan pernah lengkap | Benar — dan itu diterima. Gagal parse = task tetap tersimpan tanpa tanggal, kelihatan jelas, sekali klik buat koreksi. Bukan kegagalan senyap |
| Notifikasi kebanyakan → dimatiin user | Batas keras 4/hari, jam tenang, tiap jenis bisa dimatiin sendiri (§6.7) |
| Statistik jadi bahan menyalahkan diri | Nada deskriptif, streak punya jeda santai, review gak menghakimi (§6.4, §6.5) |
| Time blocking bikin rencana gak realistis | Batas 6 jam terjadwal/hari, jeda 10 menit antar blok (§6.2) |
| Timer meleset kalau tab/app di-suspend | Simpan `endsAt`, hitung dari jam sistem — jangan andelin `setInterval` (§6.3) |
| APK berat / lambat | Reanimated jalan di UI thread; hindari re-render list — pakai `FlashList` |
| App ditinggal setelah seminggu | Morning brief + streak + friksi rendah. Ini alasan quick-add jadi prioritas MVP |

---

## 10. Yang Perlu Disiapkan Kai

- [ ] Bikin project Supabase (atau kasih tau kalau mau gue yang bikin via MCP)
- [ ] Akun Expo (buat EAS Build) — gratis
- [ ] Akun Vercel — gratis
- [ ] Konfirmasi pilihan font: Instrument Serif + Geist + Geist Mono

---

## 11. Catatan Keputusan yang Dibatalkan

### 11.1 Google Calendar

Dibatalkan **7 Agustus 2026**, sebelum implementasi dimulai — jadi gak ada kode yang kebuang.

**Yang hilang:** jadwal dari luar HaKaiTask (meeting, kelas, undangan) gak otomatis kelihatan. Harus diisi manual sebagai `busy_blocks` kalau mau ikut diperhitungkan di time blocking.

**Yang didapat:**

| | Sebelum | Sesudah |
|---|---|---|
| Edge Functions | 3 (`google-oauth`, `gcal-sync`, `gcal-webhook`) | 0 |
| Tabel | +`google_credentials` | dihapus |
| Rahasia sisi server | refresh token Google | tidak ada |
| Setup pihak ketiga | Google Cloud project, consent screen, 2 OAuth client | tidak ada |
| Login ulang berkala | tiap 7 hari (batas consent screen mode Testing) | tidak ada |
| Waktu pengerjaan | +2–3 hari | dihemat |
| Sumber kebenaran waktu | dua (HaKaiTask & Google) → butuh resolusi konflik | satu |

Yang terakhir itu yang paling berharga. Sync dua arah artinya dua sistem sama-sama ngaku paling benar soal kapan sesuatu terjadi — dan tiap kali beda, ada yang harus ngalah. Tanpa itu, HaKaiTask punya satu sumber kebenaran dan seluruh lapisan sync tinggal ngurusin satu hal: device lo sendiri.

**Kalau nanti berubah pikiran**, jalur paling murah bukan OAuth penuh, tapi:

1. **Impor `.ics` read-only** — Google Calendar nyediain URL iCal privat per kalender. Tarik, parse, tampilin sebagai blok busy. Tanpa OAuth, tanpa token, tanpa Edge Function. Sekitar setengah hari kerja dan nutup ~80% manfaat sync baca.
2. **Ekspor feed `.ics`** — HaKaiTask nyediain URL yang bisa di-subscribe app kalender lain. Satu arah, gak ada konflik.

Dua-duanya masuk backlog §5.5 (#24, #25). OAuth penuh sengaja **tidak** ditaruh di backlog.

---

### 11.2 Parsing pakai AI

Dipertimbangkan **7 Agustus 2026** buat nangani kalimat gaul, lalu **ditolak**. Parser tetap 100% berbasis kamus dan aturan, jalan di device.

**Kenapa ditolak:**

| Alasan | Detail |
|---|---|
| **Tabrakan sama offline-first** | Prinsip §1 nomor 2: nyentang dan nambah task gak boleh butuh internet. Parsing lewat API bikin quick-add mati total pas sinyal jelek — persis di momen paling sering dipakai (di jalan, di lift, di angkot) |
| **Latensi** | 1–3 detik per input, padahal target §6.1 adalah < 5 detik dari niat sampai tersimpan. Rule-based itu instan, di bawah 5 milidetik |
| **Ngembaliin server yang baru dibuang** | API key gak boleh ada di client. Artinya harus bikin Edge Function lagi — persis komponen yang dihapus di §11.1 |
| **Biaya berulang** | Kecil per satuan, tapi ini dipakai puluhan kali sehari selamanya |
| **Gak bisa dibetulin sendiri** | Kalau model salah parse, lo cuma bisa nunggu. Kalau kamus salah, lo tambahin satu baris dan langsung benar selamanya |

**Yang kita dapat sebagai gantinya:** kamus yang tumbuh (§6.1.7). Tiap input yang gagal keparsing dicatat, dan lo bisa "ngajarin" artinya lewat setelan. Setelah sebulan, parser-nya paham gaya bahasa lo sendiri — sesuatu yang model generik gak bisa kasih tanpa fine-tuning.

**Yang direlakan:** kalimat yang bener-bener di luar kamus bakal masuk sebagai judul polos tanpa tanggal. Itu **kegagalan yang aman dan kelihatan** — task-nya tetap tersimpan, chip-nya kosong, lo langsung sadar dan bisa koreksi sekali klik. Bandingin sama AI yang nebak tanggal salah dengan penuh percaya diri: itu kegagalan yang senyap.

Keputusan ini **tidak** masuk backlog. Kalau nanti berubah pikiran, arsitekturnya sudah siap — cukup nambah satu cabang di ujung pipeline §6.1.1 pas `unmatched` gak kosong dan lagi online.

---

## 12. Log Keputusan

| Tanggal | Keputusan | Alasan |
|---|---|---|
| 2026-08-07 | Monorepo split, bukan universal Expo | reactbits/smoothui/Lenis web-only; web harus maksimal cantik |
| 2026-08-07 | Supabase sebagai backend | Sync lintas device (HP ⇄ web). Murni database + auth, tanpa Edge Function |
| 2026-08-07 | Offline-first wajib, bukan opsional | Nyentang task gak boleh gagal karena sinyal |
| 2026-08-07 | **Google Calendar dibatalkan** | Satu sumber kebenaran waktu; hemat 3 Edge Function, setup Google Cloud, & 2–3 hari kerja. Detail §11 |
| 2026-08-07 | `busy_blocks` sebagai ganti event kalender | Time blocking tetap butuh tau slot mana yang kepakai; diisi manual, sekali, bisa berulang |
| 2026-08-07 | Satu Focus Task, bukan list panjang | Menjawab "apa sekarang?", bukan "apa aja yang ada?" |
| 2026-08-07 | 8 fitur dinaikin jadi committed (§6) | Semuanya nyentuh data model / scoring — gak bisa ditempel belakangan |
| 2026-08-07 | Parser tanggal Indonesia ditulis sendiri | `chrono-node` gak punya locale `id`; kosakata tanggal Indonesia terbatas & teratur |
| 2026-08-07 | **Parsing pakai AI ditolak** | Ngelanggar offline-first, nambah latensi 1–3 detik, ngembaliin Edge Function yang baru dibuang. Detail §11.2 |
| 2026-08-07 | Kecerdasan parser dari kamus, bukan model | Kamus bisa dibetulin sendiri satu baris dan langsung benar selamanya; model gak bisa |
| 2026-08-07 | Kamus tumbuh dari koreksi user | Input gagal dicatat lokal; user bisa "ngajarin" lewat setelan (§6.1.7) |
| 2026-08-07 | Energi menggeser skor, bukan nge-filter | Task mendesak harus tetap muncul walaupun lagi capek |
| 2026-08-07 | Konflik LWW **per field**, bukan per baris | Edit `title` di HP & `dueAt` di web harus dua-duanya selamat |
| 2026-08-07 | Chart digambar SVG manual | 5 chart sederhana gak sepadan 200KB bundle; lebih nyatu sama tema hitam-putih |
| 2026-08-07 | Occurrence recurring dibuat lazy | "Tiap hari" setahun = 365 baris untuk satu kebiasaan |
| 2026-08-07 | Timer simpan `endsAt`, bukan countdown | Kebal terhadap tab suspend / HP dikunci / app di-kill |
