# HaKaiTask — Planning: Chat sebagai Halaman Utama

> Dokumen perencanaan. **Belum ada kode yang ditulis.** Pendamping `PLAN.md`;
> penomoran §1–§20 mengikuti urutan pertanyaan brief, biar gampang dirujuk.
>
> Prinsip yang gak boleh dilanggar: **100% non-AI**. Ini bukan preferensi baru —
> ini penegasan `PLAN.md` §11.2 yang udah nolak parsing pakai LLM dengan alasan
> offline-first, latensi, dan biaya. Chat ini adalah *natural language command
> interface*, bukan chatbot.

---

## §0 Ringkasan temuan & keputusan yang nunggu lo

### 0.1 Temuan dari kode yang udah ada

| # | Temuan | Dampak |
|---|---|---|
| T1 | `parseQuickAdd()` udah matang: 9 tahap, 16 kamus, ekstraksi tanggal/jam/prioritas/tag/durasi/recurrence lengkap | Jalur **CREATE praktis udah jadi**. Jangan ditulis ulang — dibungkus |
| T2 | Kamus `drop` berisi `belum`, `udah`, `sudah`; `pastRef` berisi `kemarin` | **Kosakata status & masa lalu dibuang sebelum sempat dibaca.** Query "task yang belum selesai" mustahil tanpa perubahan |
| T3 | `jadwal` ada di `intent.schedule`, `task` di `intent.neutral` | "jadwal gw hari ini apa?" kebaca sebagai perintah **bikin** jadwal |
| T4 | Verba query (`tampilin`, `lihat`, `hapus`, `ubah`, `cari`, `pindahin`) + `semua`, `kosong` **gak ada di kamus** | Semuanya jatuh ke judul. "hapus task laporan" → bikin task baru bernama *"Hapus task laporan"* |
| T5 | `applyDate()` balikin **satu titik** `Date`, bukan rentang | Query butuh interval. Ini komponen baru, bukan tambalan |
| T6 | `BusyBlock` **gak ikut sync** — `sync.ts push()` cuma nyentuh tabel `tasks`, `upsertBusyBlock` gak masuk outbox | Jadwal yang dibikin lewat chat **cuma hidup di satu device**. Padahal fitur ini berpusat di jadwal |
| T7 | Tabel `busy_blocks` di migrasi **udah lengkap** (kolom, RLS, realtime publication) | Server udah siap. Yang kurang cuma kode klien — murah dibenerin |
| T8 | `blocksOnDate()` cuma cocokin `sameDay(startAt)` | Blok **berulang** (RRULE) gak muncul di hari-hari berikutnya. Query "jadwal Senin" bakal bohong |
| T9 | Perhitungan celah waktu (§6.2 `PLAN.md`) **belum diimplementasi** | Fitur "kapan gw kosong" belum punya fondasi |
| T10 | `BusyBlock` gak punya field kategori | "tampilin semua rapat gw" harus lewat pencocokan judul, bukan filter kolom |

### 0.2 Yang perlu lo putuskan sebelum implementasi

Ditandai **[PUTUSKAN-n]** di badan dokumen.

| # | Pertanyaan | Status |
|---|---|---|
| P1 | Jadwal lewat chat wajib sync lintas device? | ✅ **DIPUTUSKAN: ya.** Sync `busy_blocks` masuk MVP (T6/T7) |
| P2 | Minggu mulai Senin atau Minggu? | ✅ **DIPUTUSKAN: Senin.** Grid kalender yang Minggu-first ikut dirapiin biar konsisten |
| P4 | Navigasi: sidebar atau pill nav 3 item? | ✅ **DIPUTUSKAN: pill nav 3 item.** Sidebar = redesign terpisah |
| P6 | Riwayat chat disimpan? | ✅ **DIPUTUSKAN: dihapus setelah 1 jam.** Lihat §2.1 di bawah |
| P3 | "minggu ini" = seluruh minggu, atau sisa minggu? | ✅ **DIPUTUSKAN: seluruh minggu**, done disembunyiin kecuali diminta |
| P5 | FocusCard tetap di dashboard? | ✅ **DIPUTUSKAN: tetap**, tanpa sapaan |
| P7 | Kategori jadwal: pencocokan judul atau kolom baru? | ✅ **DIPUTUSKAN: pencocokan judul + kamus topik.** Nol migrasi |
| P8 | Nada balasan: "kamu" atau "lo"? | ✅ **DIPUTUSKAN: "kamu"** — konsisten sama UI sekarang |

### 0.3 Konsekuensi P6 — riwayat chat TTL 1 jam

"Dihapus setelah 1 jam" beda dari "cuma di memori", dan bedanya nyata:

| Hal | Akibat |
|---|---|
| Harus tahan reload | Butuh penyimpanan lokal beneran (`localStorage`), bukan state React |
| Tiap pesan bawa `at` | Pembersihan berdasar umur per-pesan, bukan per-sesi |
| Dibersihkan **saat dibaca**, bukan pakai timer | Timer mati kalau tab ditutup. Saringan saat muat itu kebal |
| **Jangan pernah masuk `partialize`/outbox** | Isi percakapan gak boleh nyampe server |
| Pending (5 menit) selalu kedaluwarsa duluan | Dua TTL, dan hierarkinya harus konsisten: pending ≪ riwayat |

Konsekuensi UX yang perlu disadari: user bisa buka app dan lihat percakapan
setengah jalan dari 50 menit lalu, lalu pesannya ilang di tengah pemakaian.
Saran: bersihin **saat app dibuka aja**, jangan di tengah sesi aktif — sesi yang
lagi jalan jangan pernah kehilangan konteks di depan mata user.

---

## §1 Konsep keseluruhan chat interface

Chat di sini **bukan** asisten. Dia adalah **baris perintah yang ramah**.

Bedanya penting karena nentuin ekspektasi: asisten boleh nebak, baris perintah
harus jujur pas gak ngerti. Kalau user ngetik sesuatu di luar kamus, sistem
**gak boleh** ngarang jawaban — dia bilang gak paham dan nunjukin apa yang bisa.

Tiga aturan yang ngatur semua desain di bawah:

1. **Deterministik.** Input yang sama + state yang sama = output yang sama, selamanya. Bisa di-unit-test 100%.
2. **Gagal dengan kelihatan.** Kalau ragu, tanya. Jangan pernah nebak diem-diem — itu kesalahan senyap yang bikin user gak percaya (argumen `PLAN.md` §11.2).
3. **Baca itu murah, tulis itu mahal.** Kalau niat ambigu antara *lihat* dan *ubah*, selalu pilih *lihat*. Operasi merusak selalu lewat konfirmasi.

Alur satu giliran:

```
input user
   │
   ├─ ada pending? ──ya──► jawab pending (ordinal / ya-tidak)  ─┐
   │                                                            │
   └─tidak─► tokenize+slang ► deteksi VERBA ► deteksi OBJEK     │
                                   │          (task/jadwal)     │
                                   ▼                            │
                            ekstraksi ENTITAS                   │
                    (rentang, jam, status, topik, kata kunci)   │
                                   ▼                            │
                              VALIDASI ◄──────────────────────  │
                       (lengkap? ambigu? berbahaya?)            │
                    │            │             │                │
              lengkap        ambigu       gak lengkap           │
                    │            │             │                │
                    ▼            ▼             ▼                │
                 EFEK      minta pilih     minta lengkapi ◄─────┘
                    │            │             │
                    └────────────┴─────────────┘
                                 ▼
                       TEMPLATE BALASAN (statis)
```

Yang perlu digarisbawahi: **"TEMPLATE BALASAN" itu fungsi murni dari data.**
Gak ada generasi teks. Semua kalimat udah ditulis manusia, tinggal diisi slot.

---

## §2 Pembagian Home / Dashboard / Calendar

| Halaman | Isi | Sapaan? |
|---|---|---|
| **Home** (baru, default) | Chat. Pesan pembuka otomatis berisi sapaan + agenda berikutnya | **Ya, cuma di sini** |
| **Dashboard** | Todo list + jadwal hari ini. Tanpa basa-basi | Tidak |
| **Calendar** | Tetap seperti sekarang | Tidak |

**Perubahan konkret:**

- `lib/pages.ts`: `Page = "home" | "dashboard" | "calendar"`, default `"home"`.
- `<Greeting>` + `buildGreeting()` **pindah** dari dashboard ke pesan pembuka chat. Fungsinya udah ada di `scoring.ts` (`greetingSlot`, `buildGreeting`) — tinggal dipanggil dari tempat lain, bukan ditulis ulang.
- Dashboard kehilangan `<Greeting>`, sisanya tetap.
- **[PUTUSKAN-P4]** Nav: sekarang pill 2 item di `Header.tsx`. Nambah jadi 3 item itu perubahan satu baris. Sidebar beneran = redesign layout — gue saranin ditunda, bukan digabung ke pekerjaan chat.
- **[PUTUSKAN-P5]** `<FocusCard>` (satu task fokus, `PLAN.md` §4.2) tetap di dashboard sebagai puncak todo list.

**Pesan pembuka** dirakit dari `selectFocus()` yang udah ada:

| Kondisi | Template |
|---|---|
| Ada agenda berikutnya | `Selamat {slot}, {nama}. Agenda kamu berikutnya {relatif}: {judul}. Ada yang bisa dibantu?` |
| Gak ada agenda, ada task | `Selamat {slot}, {nama}. Gak ada jadwal hari ini, tapi ada {n} task nunggu. Ada yang bisa dibantu?` |
| Kosong | `Selamat {slot}, {nama}. Hari ini kosong. Mau nambahin sesuatu?` |

Pembuka **dihitung ulang tiap app dibuka**, gak disimpan.

---

## §3 Daftar intent

Prinsip: **sedikit intent, banyak filter.** Godaan terbesar di sistem begini
adalah bikin intent terpisah buat tiap kalimat (`LIST_TASK_TODAY`,
`LIST_TASK_TOMORROW`, …). Itu ledakan kombinatorial. "task hari ini" dan "task
minggu depan" adalah **intent yang sama dengan rentang berbeda**.

### MVP

| Intent | Contoh | Objek | Merusak? |
|---|---|---|---|
| `CREATE_TASK` | "tambahin task bikin laporan besok" | task | – |
| `CREATE_SCHEDULE` | "jadwalin meeting sama client besok jam 3" | jadwal | – |
| `LIST_TASK` | "tampilin task gw", "task yang belum selesai" | task | – |
| `LIST_SCHEDULE` | "jadwal gw hari ini apa?", "tampilin semua rapat gw" | jadwal | – |
| `LIST_AGENDA` | "apa agenda gw besok?" (task + jadwal digabung) | dua-duanya | – |
| `COMPLETE_TASK` | "selesaiin task laporan" | task | ringan |
| `UNCOMPLETE_TASK` | "batalin selesai laporan" | task | ringan |
| `RESCHEDULE` | "ubah task laporan jadi jam 9", "pindahin rapat Senin ke Selasa" | dua-duanya | **ya** |
| `DELETE` | "hapus meeting besok" | dua-duanya | **ya** |
| `CHECK_AVAILABILITY` | "besok jam 3 gw kosong ga?" | – | – |
| `HELP` | "bisa ngapain aja?" | – | – |
| `UNKNOWN` | fallback | – | – |

### Meta-intent (cuma valid saat ada pending)

| Intent | Contoh |
|---|---|
| `ANSWER_ORDINAL` | "yang nomor 1", "no 2", "yang pertama", "1" |
| `ANSWER_YESNO` | "ya", "iya", "gas", "jangan", "batal" |
| `CANCEL` | "udahlah", "gajadi" |

### Fase 2

`FIND_FREE_SLOTS`, `UPDATE_FIELD` (prioritas/tag/judul), `BULK_DELETE`,
`SUMMARY`, `UNDO`, `TEACH` (nyambung ke "Ajarin" §6.1.7).

**Catatan `LIST_AGENDA`:** ini bukan intent mewah — "agenda gw besok apa" itu
kalimat paling natural dan orang gak mikirin beda task vs jadwal. Kalau objek
gak disebut eksplisit, **default ke gabungan**.

---

## §4 Entitas yang harus bisa diekstrak

```ts
interface ChatEntities {
  kind?: "task" | "schedule";     // objek; kosong = dua-duanya
  range?: DateRange;              // { from, to, label }
  time?: { h: number; m: number }; // titik jam (ketersediaan / reschedule)
  status?: "todo" | "done" | "overdue";
  topic?: string;                 // id grup topik: "rapat" | "kuliah" | ...
  keyword?: string;               // sisa token yang gak kekonsumsi
  ordinal?: number;               // jawaban "nomor 2"
  confirm?: boolean;
  bulk?: boolean;                 // dipicu "semua"
  target?: { range?; time? };     // tujuan RESCHEDULE ("ke Selasa", "jadi jam 9")
}
```

Tiga yang paling gampang keliru:

**(a) `keyword` itu sisa, bukan hasil tebakan.** Setelah verba, objek, rentang,
status, dan topik dikonsumsi, token yang tersisa = kata kunci. Persis pola
`buildTitle()` yang udah dipakai parser sekarang. Konsisten dan gratis.

**(b) `range` vs `time` beda urusan.** "besok" itu rentang. "jam 3" itu titik.
"besok jam 3" itu rentang yang dipersempit jadi titik. Query pakai rentang,
ketersediaan dan reschedule pakai titik.

**(c) `RESCHEDULE` butuh DUA slot waktu.** "pindahin rapat **Senin** ke
**Selasa**" — Senin itu *penyaring*, Selasa itu *tujuan*. Pemisahnya kata
`ke` / `jadi` / `pindah ke`. Kalau cuma ketemu satu waktu, artinya itu tujuan,
dan penyaringnya dari kata kunci ("ubah task laporan jadi jam 9").

---

## §5 Struktur parser

### 5.1 Kenapa harus lapisan baru di ATAS parser lama

Ini konsekuensi langsung dari temuan T2–T4. Bukti nyata:

| Input | Kalau langsung dikasih ke `parseQuickAdd()` hari ini |
|---|---|
| "hapus task laporan" | Bikin task baru: **"Hapus task laporan"** |
| "task yang belum selesai" | `belum`+`udah` dibuang → status hilang, jadi task "Selesai" |
| "jadwal gw hari ini apa?" | `jadwal` = intent bikin-jadwal → bikin blok sibuk |
| "tampilin task kemarin" | `kemarin` dibuang → jadi task tanpa tanggal |

Jadi urutannya wajib: **verba dulu, baru sisanya.** Dan daftar `drop` harus
sadar-verba — `belum`/`udah`/`kemarin` cuma boleh dibuang di jalur CREATE.

### 5.2 Pipeline

```
parseChat(input, ctx) → ChatCommand

 0. PENDING     kalau ada pending → coba baca ordinal / ya-tidak.
                Kalau kebaca, selesai. (prioritas tertinggi — lihat §8)
 1. TOKENIZE    pakai ulang tokenizer + applySlang yang ada
 2. VERBA       (BARU) cocokin kamus verba → intent. Konsumsi tokennya
 3. OBJEK       task / jadwal. Pakai ulang nounSchedule + nounTask
 4. STATUS      (BARU) "belum selesai" / "udah selesai" / "telat"
                ← jalan SEBELUM applyDrop, kalau enggak kata kuncinya keburu ilang
 5. TOPIK       (BARU) grup topik: rapat / kuliah / olahraga
 6. BUANG       applyDrop versi sadar-verba (pastRef dipertahankan buat query)
 7. RENTANG     (BARU) resolveDateRange() → { from, to, label }
 8. JAM         pakai ulang readClock() + resolveHour()
 9. SISA        → keyword
10. VALIDASI    → Command | NeedsMore | Unknown
```

Tahap 1, 3, 8 **pakai ulang kode yang udah ada dan udah teruji**. Yang beneran
baru cuma 2, 4, 5, 7 — dan 7 dibangun di atas helper `datetime.ts` yang ada.

### 5.3 Jalur CREATE tetap milik parser lama

Begitu verba terdeteksi sebagai penciptaan (atau gak ada verba sama sekali dan
kalimatnya kelihatan seperti isian), **teruskan input asli ke
`parseQuickAdd()`** dan pakai hasilnya apa adanya. Semua kepintaran yang udah
dibangun — durasi, recurrence, subtask, sigil `!p1`/`#tag`/`@proyek` — langsung
kepake gratis di chat.

Ini yang bikin proyek ini realistis: **kita gak lagi bikin parser, kita nambah
satu lapisan verba di atas parser yang udah jalan.**

### 5.4 Peletakan modul

```
packages/core/src/chat/
  lexicon.chat.id.json   verba, grup topik, kata status, rentang daypart
  intent.ts              deteksi verba + objek
  range.ts               resolveDateRange()
  query.ts               penyaringan & pencarian
  resolve.ts             resolusi target + ambiguitas
  respond.ts             template balasan
  machine.ts             chatTurn() — reducer satu giliran
  chat.test.ts
```

Aturan keras `types.ts` tetap berlaku: **`packages/core` gak boleh impor React
atau DOM.** Makanya `chatTurn()` murni (lihat §18).

---

## §6 Parsing tanggal & waktu

### 6.1 Rentang, bukan titik

Perbedaan inti dari parser sekarang: query butuh interval setengah-terbuka
`[from, to)`. Setengah-terbuka bikin perbandingan batas gak pernah salah hitung.

| Frasa | from | to | Catatan |
|---|---|---|---|
| hari ini | hari ini 00:00 | +1 hari | |
| besok | +1 hari | +2 hari | |
| lusa | +2 hari | +3 hari | |
| kemarin | −1 hari | hari ini | **butuh `pastRef` gak dibuang** |
| senin | Senin terdekat | +1 hari | pakai `nextWeekday(mode:"nearest")` |
| senin depan | Senin +1 minggu | +1 hari | `mode:"next"` |
| minggu ini | Senin minggu ini | +7 hari | **[PUTUSKAN-P2, P3]** |
| minggu depan | Senin depan | +7 hari | |
| bulan ini | tgl 1 | tgl 1 bulan depan | |
| bulan depan | tgl 1 bulan depan | +1 bulan | |
| 25 des | tanggal itu | +1 hari | pakai `nextDateOfYear()` |
| *(kosong)* | sekarang | +∞ | default query = "yang akan datang" |

### 6.2 Daypart punya dua arti

Ini jebakan yang gampang kelewat. Kamus `daypart` sekarang memetakan kata ke
**satu jam** ("pagi" → 08:00) — benar buat *bikin* ("besok pagi" → jadwalkan
08:00), tapi salah buat *query* ("agenda besok pagi" ≠ cuma yang tepat 08:00).

Butuh tabel kedua, `daypartRange`:

| Kata | Titik (bikin) | Rentang (query) |
|---|---|---|
| pagi | 08:00 | 05:00–11:00 |
| siang | 12:00 | 11:00–15:00 |
| sore | 16:00 | 15:00–18:00 |
| malam | 19:00 | 18:00–24:00 |

Daypart **mempersempit** rentang hari yang udah ada. "besok pagi" = irisan
`besok` ∩ `pagi`.

### 6.3 Aturan yang diwarisi

`resolveHour()` yang ada tetap dipakai apa adanya: `jam 3` → 15:00, `jam 9` →
09:00, meridiem eksplisit selalu menang. Konsistensi antara chat dan quick-add
lebih penting daripada memperdebatkan aturannya.

### 6.4 `now` harus segar

`useNow()` bulatin ke menit, tapi konteks chat harus ambil `now` **saat pesan
dikirim**, bukan saat komponen mount. Sesi chat yang kebuka lewat tengah malam
bakal salah ngartiin "hari ini" kalau `now`-nya beku. Sepele tapi bikin bug yang
susah dilacak.

---

## §7 Search & filtering

Satu fungsi penyaring, dipakai semua intent LIST:

```ts
function queryItems(ctx, f: {
  kind?, range?, status?, topic?, keyword?
}): { tasks: Task[]; blocks: BusyBlock[] }
```

Urutan penerapan (murah dulu):

1. **Buang sampah** — `deletedAt`, `status === "archived"`. Wajib, cocokin `useTasks()` biar chat dan dashboard gak beda cerita.
2. **Objek** — task / jadwal / dua-duanya.
3. **Rentang** — task pakai `dueAt ?? startAt`; blok pakai tumpang-tindih `[startAt, endAt)` dengan rentang, **bukan** `sameDay(startAt)` (lihat T8/§20).
4. **Status** — `todo` = belum `done`; `overdue` = `dueAt < now && status !== "done"`.
5. **Topik** — judul mengandung salah satu sinonim grup.
6. **Kata kunci** — substring case-insensitive di judul, lalu catatan.
7. **Urutkan** — menaik berdasar waktu; yang gak punya waktu ditaruh belakang.
8. **Batasi** — maksimal 10, sisanya jadi "…dan N lagi".

### 7.1 Grup topik — **[PUTUSKAN-P7]**

"tampilin semua rapat gw" butuh konsep kategori yang gak ada di data.
Rekomendasi: kamus, bukan kolom.

```json
"topicGroups": {
  "rapat":    ["rapat", "meeting", "mtg", "sync", "standup", "brief", "diskusi"],
  "kuliah":   ["kuliah", "kelas", "praktikum", "lab", "responsi", "sidang"],
  "olahraga": ["gym", "lari", "futsal", "renang", "workout"],
  "medis":    ["dokter", "kontrol", "vaksin", "periksa"]
}
```

Kenapa ini menang buat MVP:

- **Nol migrasi.** Langsung jalan di data yang udah ada, termasuk yang dibikin sebelum fitur ini ada. Kolom kategori cuma keisi buat data baru — data lama tetap gak ketemu.
- Sejalan sama falsafah repo: *"Nambah kata = nambah satu baris di kamus, bukan ngedit logika."*
- Kalau nanti kurang, kolom kategori bisa ditambah belakangan tanpa ngebuang kerjaan ini.

Batasnya jujur: jadwal berjudul "ketemu klien" gak akan kena grup "rapat".
Itu kegagalan yang kelihatan — user tinggal nambah satu kata ke kamus.

---

## §8 Penanganan ambiguitas

### 8.1 Mesin state

Satu slot pending, disimpan **di memori aja** (**[PUTUSKAN-P6]**):

```ts
type Pending =
  | { kind: "choose";  action: PendingAction; candidates: Ref[]; at: number }
  | { kind: "confirm"; action: PendingAction; summary: string;   at: number }
  | { kind: "fill";    action: PendingAction; missing: "title"|"date"|"time" }
  | null;
```

Aturan yang bikin percakapan gak nyangkut:

| Aturan | Alasan |
|---|---|
| Pending **selalu diperiksa duluan** | "1" harus kebaca sebagai pilihan, bukan angka jam |
| Input yang kebaca sebagai perintah **baru** membatalkan pending | User berhak ganti pikiran tanpa harus bilang "batal" |
| Pending kedaluwarsa setelah **5 menit** | Nanya "yang mana?" atas daftar dari sejam lalu itu ngeselin |
| Maksimal **satu** pending | Konfirmasi bertingkat bikin user bingung |
| Kandidat divalidasi ulang **saat dieksekusi** | Data bisa berubah lewat sync di antara tanya dan jawab |

Aturan terakhir itu penting dan gampang kelewat: kandidat disimpan sebagai
**id**, dan sebelum efek dijalankan id-nya dicek masih ada. Kalau udah ilang →
"Task-nya keburu ilang, mungkin udah dihapus dari device lain."

### 8.2 Berapa hasil → apa yang terjadi

| Jumlah | Aksi |
|---|---|
| 0 | "Gak nemu {objek} yang cocok." + saran pelonggaran ("coba tanpa tanggal") |
| 1 | Langsung jalan (kalau merusak → konfirmasi dulu) |
| 2–8 | Daftar bernomor, minta pilih |
| >8 | Nolak memilih: "Ada 23 yang cocok, kebanyakan buat dipilih. Persempit ya." |

### 8.3 Contoh

```
User:   ubah meeting gw besok
Sistem: Ada 2 meeting besok. Yang mana?
        1. 10:00 — Meeting Client A
        2. 15:00 — Meeting Internal
User:   yang nomor 1
Sistem: Meeting Client A mau diubah jadi jam berapa?     ← pending "fill"
User:   jam 4
Sistem: Oke, Meeting Client A dipindah ke besok 16:00.
```

Perhatikan: perintah awal **gak lengkap** (gak nyebut waktu tujuan). Sistem gak
nolak seluruh kalimat — dia nyimpen niatnya dan minta bagian yang kurang.
Ini bedanya terasa banget antara sistem yang enak dipakai dan yang bikin capek.

---

## §9 Mekanisme konfirmasi

Wajib konfirmasi kalau **salah satu** terpenuhi:

1. Operasi **hapus** apa pun.
2. Operasi **massal** (`bulk`, dipicu kata "semua") — berapa pun jumlahnya.
3. Terdampak **> 3 item**.
4. Nulis ke **masa lalu** ("jadwalin rapat kemarin jam 3") — kemungkinan besar salah parse.

Gak perlu konfirmasi: bikin satu item, centang selesai, batal-selesai. Semuanya
gampang dibalikin dan sering dipakai — minta konfirmasi malah bikin sebel.

Konfirmasi **harus nunjukin apa yang bakal kena**, bukan cuma jumlah:

```
User:   hapus semua meeting minggu ini
Sistem: Bakal kehapus 3 jadwal:
        • Sen 10:00 — Meeting Client A
        • Rab 14:00 — Sync tim
        • Jum 09:00 — Standup
        Yakin? (ya / batal)
User:   ya
Sistem: 3 jadwal dihapus. Ketik "batal" kalau salah.
```

`removeTask()` itu tombstone (soft delete), jadi **undo secara teknis gampang**
— tinggal set `deletedAt` balik ke `undefined`. Murah, dan efeknya ke rasa aman
gede. Gue saranin ini masuk MVP walaupun undo yang lain ditunda.

---

## §10 Error & fallback

| Kondisi | Balasan | Catatan desain |
|---|---|---|
| Intent gak dikenal | "Maaf, gue belum bisa itu. Coba yang berhubungan sama task atau jadwal — ketik **bisa apa aja** buat lihat daftarnya." | Selalu kasih jalan keluar |
| Verba jelas, objek gak jelas | "Mau lihat task atau jadwal?" | Jangan tebak |
| Judul kosong ("tambahin besok jam 3") | "Mau nambahin apa? Kasih judulnya." | **Jangan pernah bikin task berjudul kosong** |
| Tanggal gak jelas ("ubah rapat nanti") | Perlakukan sebagai tanpa-tanggal, cari se-semuanya, lanjut ke ambiguitas | `nanti` udah jadi soft anchor di parser |
| Target gak ketemu | "Gak nemu task 'laporan'. Yang paling mirip: 'Laporan bulanan'." | Pakai `editDistanceAtMost1()` yang udah ada |
| Kebanyakan hasil | "Ada 23. Persempit pakai tanggal atau kata kunci." | Jangan muntahin semua |
| Perintah ganda | "Satu-satu ya. Mau yang mana duluan?" | Lihat §20 E7 |
| Kata gak dikenal tapi dekat kamus | "Maksudnya 'besok'?" | `unmatched` dari parser udah nyediain ini |

**HELP itu kontekstual, bukan tembok teks.** Balasan `HELP` nunjukin 5–6 contoh
yang bisa **langsung diketuk** buat ngisi input — jauh lebih kepake daripada
dokumentasi 30 baris.

---

## §11 Sistem template balasan

Balasan itu **data + template**, bukan string doang:

```ts
interface ChatMessage {
  id: string;
  role: "user" | "system";
  text: string;
  refs?: Ref[];              // dirender jadi kartu yang bisa diketuk
  choices?: string[];        // tombol balas cepat: "ya" / "batal"
  at: string;
}
```

Kenapa `refs` penting: pas sistem jawab "berikut task kamu", tiap barisnya
harusnya bisa **diketuk buat buka `<DetailSheet>` yang udah ada**. Chat jadi
navigasi, bukan cuma teks. Biayanya kecil, hasilnya beda jauh.

Aturan nada (**[PUTUSKAN-P8]** — gue saranin "kamu", konsisten sama UI):

- Pendek. Satu-dua kalimat.
- Sebutin ulang apa yang dilakukan, biar user bisa nangkep salah parse: "Oke, **Meeting Client** besok **15:00**" — bukan "Tersimpan!"
- Gak ada emoji, gak ada seru berlebihan. Sesuai bahasa desain hitam-putih.
- Kalau nol hasil, ajak lanjut, jangan jadi jalan buntu.

Semua template kumpul di `respond.ts` sebagai fungsi murni — gampang di-review
sekali baca, dan nanti gampang kalau mau multi-bahasa.

---

## §12 Scope MVP

Sudah termasuk:

- [ ] Home = chat; sapaan pindah ke sini; dashboard disederhanain (§2)
- [ ] Kamus verba + audit kamus `drop` (T2–T4) ← **kerjain paling awal**
- [ ] `resolveDateRange()` + `daypartRange` (§6)
- [ ] CREATE task & jadwal (bungkus `parseQuickAdd`)
- [ ] LIST task / jadwal / agenda + filter tanggal, status, topik, kata kunci
- [ ] COMPLETE / UNCOMPLETE
- [ ] RESCHEDULE (ubah tanggal/jam) — pengeditan yang paling sering dipakai
- [ ] DELETE satuan + konfirmasi + undo
- [ ] Ambiguitas: daftar bernomor + jawaban ordinal
- [ ] `CHECK_AVAILABILITY` titik ("besok jam 3 kosong ga?")
- [ ] HELP + fallback
- [ ] **Sync `busy_blocks`** (T6/T7) — **[PUTUSKAN-P1]**
- [ ] **Perbaiki `blocksOnDate` buat blok berulang** (T8) — kalau enggak, query jadwal bakal bohong

Dua item terakhir bukan fitur chat, tapi chat **memperlihatkan** kerusakannya
ke user secara langsung. Masuk MVP karena itu.

Sengaja dikecualikan dari MVP: pengeditan judul/prioritas/tag, operasi massal,
enumerasi celah waktu, ringkasan, riwayat chat yang disimpan.

---

## §13 Fase 2

| Fitur | Kenapa ditunda |
|---|---|
| `FIND_FREE_SLOTS` ("kapan gw kosong besok?") | Butuh `computeFreeSlots()` dari `PLAN.md` §6.2 yang belum ada. **Bangun sekali, dipakai berdua** — jangan bikin versi khusus chat |
| Operasi massal (hapus/pindah banyak) | Butuh konfirmasi matang + undo yang teruji dulu |
| `UPDATE_FIELD` (prioritas, tag, judul) | Jauh lebih jarang daripada ganti waktu |
| `SUMMARY` ("gimana minggu gw?") | Numpang di §6.5 Statistik |
| `TEACH` dari chat | Nyambung ke "Ajarin" §6.1.7; chat itu tempat paling pas buat nangkep kegagalan parse |
| Riwayat chat persisten | Baru masuk akal kalau ada yang perlu digulir ke belakang |

**Penilaian soal ketersediaan waktu:** pengecekan **titik** ("jam 3 kosong ga?")
itu murah — cuma cek tumpang-tindih satu timestamp lawan blok + task terjadwal.
Nilainya tinggi, masuk MVP. **Enumerasi celah** ("kapan gw kosong?") butuh
jendela kerja, penggabungan celah, dan penyaringan celah minimum — itu §6.2
seutuhnya. Fase 2, dan dikerjain sebagai fondasi bersama, bukan tempelan.

---

## §14 Yang sebaiknya TIDAK dibuat

| Jangan | Alasan |
|---|---|
| Obrolan basa-basi ("apa kabar") | Bikin user ngira ini AI, lalu kecewa. Chat ini alat |
| Pertanyaan analitik bebas ("kenapa gw sering telat?") | Butuh penalaran. Ini wilayah layar statistik |
| Perintah majemuk ("tambahin A terus hapus B") | Ledakan state ganda; separuh-jalan itu berbahaya. Tolak dengan sopan |
| Perintah bersyarat ("kalau besok kosong, jadwalin X") | Butuh eksekusi tertunda. Kompleksitasnya gak sebanding |
| Ubah setelan lewat chat | Jarang dipakai, dan UI-nya lebih jelas |
| Pencarian bebas ala "tanya data lo" | Tanpa AI hasilnya bakal ngecewain. Filter eksplisit lebih jujur |
| Auto-koreksi diam-diam pas ragu | Melanggar prinsip §1.2. Tanya, jangan nebak |

---

## §15 Contoh alur percakapan

**A. Bikin, lalu langsung dicek**

```
Sistem: Selamat malam, Kai. Agenda kamu berikutnya besok: Agenda jalan
        sama keluarga. Ada yang bisa dibantu?
User:   tambahin task bikin laporan besok jam 9 !p1
Sistem: Oke — Bikin laporan, besok 09:00, prioritas tinggi.
User:   apa aja tugas gw besok?
Sistem: Besok ada 2 task:
        • 09:00 — Bikin laporan · P1
        • 14:00 — Revisi vlog
```

Sigil `!p1` jalan gratis karena jalur CREATE-nya `parseQuickAdd` (§5.3).

**B. Ambigu → dipilih → kurang lengkap → dilengkapi**

```
User:   ubah meeting gw besok
Sistem: Ada 2 meeting besok. Yang mana?
        1. 10:00 — Meeting Client A
        2. 15:00 — Meeting Internal
User:   yang nomor 1
Sistem: Meeting Client A mau dipindah ke jam berapa?
User:   jam 4
Sistem: Oke, Meeting Client A dipindah ke besok 16:00.
```

**C. Massal → konfirmasi → undo**

```
User:   hapus semua meeting minggu ini
Sistem: Bakal kehapus 3 jadwal:
        • Sen 10:00 — Meeting Client A
        • Rab 14:00 — Sync tim
        • Jum 09:00 — Standup
        Yakin? (ya / batal)
User:   ya
Sistem: 3 jadwal dihapus. Ketik "batal" kalau salah.
User:   batal
Sistem: Dibalikin. 3 jadwal muncul lagi.
```

**D. Gak paham → ditawarin jalan keluar**

```
User:   gimana caranya biar gw produktif
Sistem: Maaf, gue belum bisa itu. Gue bisa bantu soal task sama jadwal —
        ketik "bisa apa aja" buat lihat daftarnya.
```

---

## §16 Input → intent → aksi → balasan

| Input | Intent | Entitas | Aksi | Balasan |
|---|---|---|---|---|
| "tambahin task bikin laporan besok" | `CREATE_TASK` | judul, `dueAt` besok, allDay | `CREATE_TASK` | "Oke — Bikin laporan, besok." |
| "jadwalin meeting sama client besok jam 3" | `CREATE_SCHEDULE` | judul, 15:00–16:00 | `CREATE_BUSY` | "Oke — Meeting sama client, besok 15:00." |
| "tampilin task yang belum selesai" | `LIST_TASK` | `status:todo` | – | daftar + `refs` |
| "tampilin semua rapat gw" | `LIST_SCHEDULE` | `topic:rapat` | – | daftar |
| "jadwal gw hari ini apa?" | `LIST_SCHEDULE` | rentang hari ini | – | "Jadwal kamu hari ini: …" |
| "selesaiin task laporan" | `COMPLETE_TASK` | `keyword:laporan` | resolve → `PATCH` | "Bikin laporan ditandai selesai." |
| "ganti deadline tugas matematika ke Jumat" | `RESCHEDULE` | kw:matematika, target Jumat | resolve → `PATCH` | "Dipindah ke Jumat." |
| "hapus meeting besok" | `DELETE` | jadwal, besok | resolve → konfirmasi | "Hapus Meeting Client A besok 10:00? (ya/batal)" |
| "besok jam 3 gw kosong ga?" | `CHECK_AVAILABILITY` | besok 15:00 | cek tumpang-tindih | "Kosong." / "Ada Meeting Client A." |
| "bisa ngapain aja?" | `HELP` | – | – | daftar + contoh yang bisa diketuk |

Contoh konkret bentuk perantaranya:

```jsonc
// "jadwalin meeting sama client besok jam 3"   (now = 2026-08-09)
{
  "intent": "CREATE_SCHEDULE",
  "entities": { "kind": "schedule" },
  "draft": {
    "title": "Meeting sama client",
    "startAt": "2026-08-10T15:00:00+07:00",
    "endAt":   "2026-08-10T16:00:00+07:00"   // default 60m, aturan yang ada
  }
}
```

---

## §17 Struktur data

**Gak ada perubahan skema database buat MVP.** Semua ditopang tipe yang ada.

Tipe baru (murni di klien, gak disimpan):

```ts
type Ref = { kind: "task" | "busy"; id: string; title: string; at?: string };

type Effect =
  | { type: "CREATE_TASK";  draft: NewTask }
  | { type: "CREATE_BUSY";  draft: NewBusy }
  | { type: "PATCH_TASK";   id: string; patch: Partial<Task> }
  | { type: "PATCH_BUSY";   id: string; patch: Partial<BusyBlock> }
  | { type: "DELETE_TASK";  id: string }
  | { type: "DELETE_BUSY";  id: string }
  | { type: "RESTORE_TASK"; id: string };
```

Tambahan kamus (`lexicon.chat.id.json`): `verbs`, `statusWords`, `topicGroups`,
`daypartRange`, `ordinals`, `affirm`, `deny`.

Kalau **[PUTUSKAN-P7]** berubah jadi kolom kategori, baru butuh migrasi
`busy_blocks.category` + pembaruan `mapping.ts`. Bukan buat MVP.

---

## §18 Arsitektur "backend" parser

**Koreksi terhadap framing brief: gak ada backend, dan gak boleh ada.**

`PLAN.md` §11.1 udah ngebuang semua Edge Function; §11.2 nolak parsing lewat
API karena melanggar offline-first. Parser chat jalan **di device**, di
`packages/core`, sinkron, tanpa jaringan. Supabase tetap cuma database + auth.

Konsekuensinya: **core harus murni.** `chatTurn()` gak boleh nyentuh store:

```ts
export function chatTurn(input: string, ctx: ChatContext): TurnResult;

interface ChatContext {
  now: Date;
  tasks: readonly Task[];
  blocks: readonly BusyBlock[];
  settings: UserSettings;
  pending: Pending;
  userLexicon?: Record<string, string>;
}

interface TurnResult {
  messages: ChatMessage[];
  effects: Effect[];     // deskripsi, BUKAN eksekusi
  pending: Pending;
}
```

Lapisan app yang ngejalanin `effects` ke store (`upsertTask`, `patchTask`,
`removeTask`, `upsertBusyBlock`). Manfaatnya nyata:

- Seluruh perilaku chat **bisa di-unit-test tanpa React, tanpa DOM, tanpa jaringan** — persis seperti `parser.test.ts` sekarang.
- Mutasi tetap lewat satu pintu (`store` → outbox → sync). Chat gak bikin jalur tulis kedua yang bisa lolos dari offline-first.
- Mobile nanti (`PLAN.md` §5.3) langsung kebagian mesinnya gratis.

---

## §19 Cara nambah command baru nanti

Registri, bukan `switch` raksasa:

```ts
interface CommandSpec {
  id: Intent;
  verbs: string[];             // dari kamus, bukan hardcode
  needs: Array<"target" | "range" | "time">;
  destructive: boolean;
  plan(e: ChatEntities, ctx: ChatContext): Plan;
}
```

Nambah perintah = nambah **satu file + beberapa baris kamus**. Persis falsafah
yang udah ditulis di kepala `lexicon.id.json`:
*"Nambah kata = nambah satu baris di sini, bukan ngedit logika."*

Dua hal yang bikin ini beneran bertahan:

1. **Sinonim masuk `slang`, bukan `verbs`.** `applySlang` jalan paling awal, jadi satu baris `"liatin": "lihat"` otomatis nyambung ke semua pengecekan di bawahnya. Ini mekanisme yang udah ada dan udah terbukti.
2. **Tiap perintah baru wajib bawa contoh di test.** File test jadi dokumentasi kemampuan yang gak bisa basi.

---

## §20 Edge case yang mungkin belum kepikiran

Diurut dari yang paling mungkin bikin masalah nyata.

| # | Kasus | Kenapa berbahaya | Penanganan |
|---|---|---|---|
| **E1** | **Kamus `drop` ngebuang `belum`/`udah`/`kemarin`** (T2) | Fitur query status **mustahil** tanpa dibenerin. Bukan edge case — ini penghalang | `drop` harus sadar-verba; status dibaca sebelum tahap buang |
| **E2** | **Blok berulang gak muncul di hari berikutnya** (T8) | "jadwal Senin" bakal **bohong** dengan yakin. Rusaknya senyap | Kembangkan RRULE ke okurensi dalam rentang, sebelum penyaringan |
| **E3** | **Jadwal gak ke-sync** (T6) | User bikin jadwal di HP, hilang di laptop. Fitur kelihatan rusak | Tambah `busy_blocks` ke outbox + `sync.ts` (server udah siap, T7) |
| **E4** | Task **all-day** vs pertanyaan jam | "besok jam 3 kosong ga?" — task all-day besok bikin dianggap sibuk seharian | All-day **gak** nutup slot jam. Aturan eksplisit |
| **E5** | Balasan ordinal bentrok sama jam | "2" = pilihan kedua atau jam 2? | Pending diperiksa duluan, selalu (§8.1) |
| **E6** | `beresin` = kata benda task **dan** verba selesai | "beresin laporan" ambigu: bikin atau centang? | Kalau ada target yang cocok → tawarkan centang; kalau gak ada → bikin baru |
| **E7** | Perintah majemuk | Eksekusi separuh jalan = data rusak | Deteksi >1 verba → tolak, minta satu-satu |
| **E8** | Judul kosong setelah parse | Bikin task tanpa judul = sampah senyap | Wajib pending `fill` (§10) |
| **E9** | `now` beku lewat tengah malam | "hari ini" salah hari | Ambil `now` saat kirim, bukan saat mount (§6.4) |
| **E10** | Zona waktu antar device | Disimpan UTC, diparse lokal. Beda TZ = beda hari | Risiko yang udah ada; chat cuma bikin lebih kelihatan. **Perlu diputuskan terpisah** |
| **E11** | Judul kembar ("laporan" ada 3) | Salah sasaran saat hapus | Selalu lewat resolusi ambiguitas, walau tanpa tanggal |
| **E12** | Centang task yang udah selesai | Balasan "error" bikin bingung | Idempoten: "Udah selesai dari kemarin, kok." |
| **E13** | Kandidat berubah antara tanya & jawab | Sync bisa ngubah data di tengah | Validasi ulang id saat eksekusi (§8.1) |
| **E14** | Nulis ke masa lalu | "jadwalin rapat kemarin" biasanya salah parse | Konfirmasi dulu (§9 poin 4) |
| **E15** | Hasil kebanyakan | Ngeluarin 200 baris ke chat | Batas 10 + "…dan N lagi" |
| **E16** | Cuma nulis tanggal ("besok") | Verba gak jelas | Default ke **lihat**, jangan bikin (prinsip §1.3) |
| **E17** | Task berjudul "meeting notes" | Kena pencarian "meeting" padahal dia task | Penyaringan objek jalan sebelum kata kunci |
| **E18** | Riwayat chat numpuk | Kalau dipersist, storage bengkak & ikut `partialize` | **[PUTUSKAN-P6]** — saran: jangan persist |
| **E19** | Jadwal lintas tengah malam (23:00–01:00) | Muncul di hari yang salah | Pakai tumpang-tindih rentang, bukan `sameDay` — sama seperti E2 |
| **E20** | Awal minggu gak konsisten | `nextWeek()` Senin-first, grid kalender Minggu-first | **[PUTUSKAN-P2]** — samain, terserah yang mana asal satu |

---

## §21 Urutan kerja yang disarankan

Diurut biar risiko terbesar mati duluan, bukan biar cepet kelihatan jadi.

| Tahap | Isi | Kenapa di sini |
|---|---|---|
| **1** | Audit kamus + kamus verba + `resolveDateRange()` — **tanpa UI** | E1 itu penghalang. Kalau ini gak beres, sisanya gak ada artinya. Bisa dites penuh tanpa nyentuh React |
| **2** | `chatTurn()` + LIST & CREATE + template balasan | Jalur baca dulu: gak merusak, gampang diverifikasi |
| **3** | UI chat + Home/Dashboard/Calendar | Baru sekarang butuh layar |
| **4** | Resolusi target: COMPLETE / RESCHEDULE / DELETE + ambiguitas + konfirmasi + undo | Bagian paling rawan, dikerjain setelah fondasinya kokoh |
| **5** | Sync `busy_blocks` (T6) + perbaikan blok berulang (T8) | Bisa paralel; wajib sebelum rilis |
| **6** | `CHECK_AVAILABILITY` titik | Kecil, penutup yang manis |

Tahap 1 dan 2 **seluruhnya bisa di-unit-test** sebelum satu piksel pun digambar.
Itu keuntungan terbesar dari arsitektur non-AI yang murni — dan alasan kenapa
`chatTurn()` harus tetap murni (§18).

---

## §22 Log keputusan (usulan, nunggu disetujui)

| Tanggal | Keputusan | Alasan |
|---|---|---|
| 2026-08-09 | Home jadi chat; sapaan cuma di chat | Dashboard jadi alat, bukan sapaan |
| 2026-08-09 | Chat = command interface, bukan asisten | Nerusin §11.2; menjaga ekspektasi tetap jujur |
| 2026-08-09 | Lapisan verba **di atas** `parseQuickAdd`, bukan parser baru | Parser CREATE udah matang & teruji (T1) |
| 2026-08-09 | `drop` jadi sadar-verba | Kamus sekarang aktif merusak query (T2) |
| 2026-08-09 | Query pakai rentang, bikin pakai titik | Beda kebutuhan mendasar (T5) |
| 2026-08-09 | Kategori jadwal lewat kamus topik, bukan kolom | Nol migrasi; jalan di data lama (P7) |
| 2026-08-09 | `chatTurn()` murni; app yang jalanin efek | Bisa dites tanpa React; satu pintu tulis (§18) |
| 2026-08-09 | Ketersediaan: titik di MVP, celah di Fase 2 | Celah butuh §6.2 yang belum ada (T9) |
| 2026-08-09 | Sedikit intent, banyak filter | Nyegah ledakan kombinatorial (§3) |
| 2026-08-09 | Kalau ragu, pilih baca | Salah-baca murah, salah-tulis mahal (§1.3) |
| 2026-08-09 | **Task & jadwal disatuin jadi satu jenis** | Lihat §23 |

---

## §23 Task & jadwal disatuin

**Keputusan:** input chat SELALU bikin Task. Kata `task`, `jadwal`, dan
`agenda` semuanya berarti hal yang sama waktu nyari.

**Kenapa.** Pemisahan itu bikin satu kelas kegagalan yang kejadian berkali-kali
di pemakaian nyata: user bikin sesuatu pakai kata yang kebetulan masuk
`nounSchedule` ("rapat", "zoom", "kelas"), barangnya jadi `BusyBlock` — lalu
"tampilin task" gak nemu. Kebalikannya juga. Tiap kali, jawabannya benar
secara harfiah dan **salah secara pengalaman**: user gak mikir "ini task apa
jadwal", dia cuma tau ada sesuatu di hari Rabu.

Sempat ditambal dengan petunjuk "tapi ada N jadwal — maksudnya itu?". Itu
nutupin gejalanya, bukan sebabnya: sistemnya tetap minta user mikirin
pembagian yang gak pernah dia minta.

**Yang gak hilang.** Rentang jam eksplisit ("jam 3-4") tetap kesimpan di
`startAt` + `estimateMin`, jadi durasi buat perhitungan celah §6.2 masih utuh.
`BusyBlock` lama tetap kebaca, ketemu di pencarian, bisa dihapus dan digeser —
cuma gak dibikin baru lagi.

**Yang direlakan.** Sigil `%sibuk` gak lagi bikin jenis terpisah, dan blok
"nutup slot tanpa perlu dicentang" jadi hilang sebagai konsep baru. Kalau nanti
time blocking butuh itu lagi, bedanya lebih tepat jadi **atribut** di Task
(mis. `blocking: true`) daripada jenis kedua — atribut gak bikin barang hilang
dari pencarian.
