<div align="center">

# HaKaiTask

**Task manager berbahasa Indonesia yang kamu ajak ngobrol — tanpa AI sama sekali.**

Ketik `jadwalin rapat sama klien rabu jam 3` dan langsung jadi.
Bukan karena ada model bahasa yang nebak, tapi karena ada kamus yang bisa kamu baca,
kamu betulkan, dan jalan tanpa internet.

[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React_18-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)](https://vite.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-3FCF8E?logo=supabase&logoColor=white)](https://supabase.com/)
[![Tanpa AI](https://img.shields.io/badge/AI-nol-000000)](#2-kenapa-tanpa-ai)
[![Offline first](https://img.shields.io/badge/offline--first-ya-000000)](#3-offline-first-yang-beneran)

</div>

---

## Sekilas

```
Selamat malam, Kai. Agenda kamu berikutnya Sen 10 Agu 09:00: Standup.
Ada yang bisa dibantu?

> jadwalin rapat sama klien rabu jam 3
  Oke — "Rapat sama klien", Rab 12 Agu 15:00.

> apa aja agenda gw rabu?
  Ada 2 agenda Rabu:
  • Rab 12 Agu 09:00 — Standup
  • Rab 12 Agu 15:00 — Rapat sama klien

> rabu jam 4 gw kosong ga?
  Rabu jam 16.00 kamu kosong, gak ada agenda di waktu itu.

> selesaiin rapat
  "Rapat sama klien" ditandai selesai.

> ok makasih
  Sama-sama.
```

Kalimat terakhir itu penting: **basa-basi gak nyangkut jadi data.** Banyak app
begini yang diam-diam bikin task berjudul "Makasih".

---

## Daftar isi

| | |
|---|---|
| [Kenapa pakai ini](#kenapa-pakai-ini) | Empat alasan yang bukan basa-basi |
| [Fitur](#fitur) | Apa aja yang bisa dilakukan |
| [Contekan perintah](#contekan-perintah) | Tabel lengkap semua perintah |
| [Kamus pribadi](#kamus-pribadi) | Ngajarin istilah kamu sendiri |
| [Mulai pakai](#mulai-pakai) | Jalanin di komputer sendiri |
| [Cara kerjanya](#cara-kerjanya) | Arsitektur & alur data |
| [Status](#status-apa-yang-udah-jadi) | Yang udah jadi vs belum |

---

## Kenapa pakai ini

### 1. Ngerti bahasa kamu, bukan bahasa formulir

Kebanyakan task manager minta kamu isi formulir: judul, tanggal, jam, prioritas,
label. HaKaiTask cukup dikasih satu kalimat.

```
revisi vlog besok jam 2 !p1 #konten 90m
```

→ judul **Revisi vlog**, jatuh tempo **besok 14:00**, prioritas **P1**,
label **#konten**, estimasi **90 menit**. Satu baris, sekali Enter.

<details>
<summary><b>Yang dimengerti parser</b> (klik buat lihat)</summary>

<br>

| Kategori | Contoh yang dimengerti |
|---|---|
| Tanggal relatif | `hari ini`, `besok`, `lusa`, `kemarin`, `3 hari lagi`, `dalam 2 minggu` |
| Nama hari | `senin`, `senin depan`, `senin ini`, `hari jumat` |
| Rentang | `minggu ini`, `minggu depan`, `bulan ini`, `bulan depan` |
| Tanggal pasti | `25 des`, `tanggal 25`, `25/12`, `25/12/2027` |
| Jam | `jam 3`, `jam 14:30`, `setengah 3`, `jam 3 lewat 15`, `jam 2 sampai 4` |
| Bagian hari | `pagi`, `siang`, `sore`, `malam`, `subuh`, `dini hari` |
| Perkiraan | `jam 3an`, `sekitar jam 3` |
| Durasi | `90 menit`, `2 jam`, `90m`, `1.5j`, `sebentar`, `setengah jam` |
| Pengulangan | `tiap hari`, `tiap hari kerja`, `tiap senin rabu jumat`, `tiap 2 minggu`, `tiap tanggal 25` |

Jam yang ambigu diselesaikan dengan aturan tetap: **`jam 3` = 15:00**,
**`jam 9` = 09:00**. Kalau kamu sebut `pagi`/`malam`, itu yang menang.

</details>

<details>
<summary><b>Token bertanda</b> — buat yang suka cepat</summary>

<br>

| Tanda | Arti | Contoh |
|---|---|---|
| `!` | Prioritas | `!p1` `!p2` `!!` (= P1) `!` (= P2) |
| `#` | Label | `#konten` `#kuliah` |
| `@` | Proyek | `@kerja` `@skripsi` |
| `~` | Energi | `~berat` `~ringan` |
| `*` | Pengingat | `*30m` `*2jam` |
| `+` | Sub-task | `+riset +tulis draf` |
| `//` | Catatan | `beli kopi // yang arabica` |
| `" "` | Kunci teks | `"jam 5"` biar gak dibaca sebagai waktu |

</details>

### 2. Kenapa tanpa AI

Ini keputusan sadar, bukan keterbatasan. Alasannya ditulis lengkap di
[`PLAN.md` §11.2](PLAN.md), ringkasnya:

| | Parser kamus (dipakai) | Parsing pakai LLM (ditolak) |
|---|---|---|
| **Kecepatan** | < 5 milidetik | 1–3 detik |
| **Offline** | Jalan penuh | Mati total |
| **Kalau salah** | Tambah 1 baris kamus, benar selamanya | Nunggu vendor |
| **Bisa diperiksa** | Ya, kamusnya file JSON biasa | Tidak |
| **Biaya** | Nol | Per panggilan, selamanya |
| **Data kamu** | Gak pernah keluar device | Dikirim ke server orang |

Yang direlakan: kalimat di luar kamus masuk sebagai judul polos tanpa tanggal.
Itu **kegagalan yang kelihatan** — kamu langsung sadar dan bisa koreksi.
Bandingkan dengan AI yang nebak tanggal salah dengan penuh percaya diri: itu
kegagalan yang senyap, dan baru ketahuan pas kamu telat.

### 3. Offline-first yang beneran

Bukan "offline-first" tempelan. Nyentang task **gak pernah** nunggu jaringan.

```mermaid
flowchart LR
    A["Ketik / centang"] --> B["Tulis ke store lokal<br/>(langsung, optimistik)"]
    B --> C["Masuk outbox"]
    C -->|online| D["Kirim ke Supabase"]
    C -->|offline| E["Numpuk, aman"]
    E -.->|online lagi| D
    D --> F["Ack, keluar dari antrean"]
```

- Semua perubahan **ditulis lokal dulu**, antrean sync nyusul sendiri.
- Konflik diselesaikan **last-write-wins per field**, bukan per baris — edit
  judul di HP dan jam di laptop dua-duanya selamat.
- Hapus pakai **tombstone**, jadi yang dihapus di HP gak "hidup lagi" dari cache laptop.
- Kalau kirim gagal terus, statusnya kelihatan dan bisa dicoba ulang — bukan hilang diam-diam.

### 4. Kamusnya tumbuh ikut kamu

Punya istilah sendiri? Ajarin sekali, kepakai selamanya. Tanpa training, tanpa
model, tanpa data kamu ke mana-mana. Lihat [Kamus pribadi](#kamus-pribadi).

---

## Fitur

<details open>
<summary><b>Chat — halaman utama</b></summary>

<br>

Bukan asisten, tapi **baris perintah yang ramah**. Semua kalimat balasan ditulis
manusia dan tersimpan sebagai template — tidak ada teks yang dihasilkan model.

- Bikin, lihat, cari, ubah jadwal, centang selesai, hapus
- Cek waktu kosong: `besok jam 3 gw kosong ga?`
- Semua operasi menghapus **wajib konfirmasi**, lengkap dengan daftar apa yang kena
- Salah hapus? Ketik `batal` — kembali lagi
- Kalau ada dua yang cocok, sistem **gak milih sendiri**; dia nanya

</details>

<details>
<summary><b>Sistem gak pernah nebak kalau ragu</b></summary>

<br>

Aturan yang dipegang: **kalau ragu, pilih baca.** Salah-baca cuma bikin daftar
yang gak kepake; salah-tulis bikin data kotor yang harus kamu bersihin.

```
> ubah meeting gw besok
  Ada 2 meeting besok. Yang mana?
  1. 10:00 — Meeting Client A
  2. 15:00 — Meeting Internal

> yang nomor 1
  "Meeting Client A" mau dipindah ke kapan?

> jam 4
  "Meeting Client A" dipindah ke Sab 8 Agu 16:00.
```

Perhatikan: perintah awalnya **gak lengkap**, tapi sistem gak nolak seluruh
kalimat. Dia simpan niatnya dan minta bagian yang kurang.

</details>

<details>
<summary><b>Dashboard — satu fokus, bukan daftar panjang</b></summary>

<br>

Menjawab **"apa sekarang?"**, bukan "apa aja yang ada?".

- **Focus Card**: satu task terpilih otomatis dari skor gabungan tenggat,
  prioritas, dan energi
- **Berikutnya**: agenda terdekat, ringkas
- Tanpa sapaan, tanpa basa-basi — dashboard itu alat

</details>

<details>
<summary><b>Kalender</b></summary>

<br>

- Grid bulanan; tiap hari punya titik penanda kepadatan (merah kalau ada yang lewat tenggat)
- Klik tanggal → daftar agenda hari itu
- Tombol **+ Tambah** membawa tanggal yang dipilih ke chat, jadi kamu tinggal
  nulis judulnya

</details>

<details>
<summary><b>Sinkronisasi lintas perangkat</b></summary>

<br>

- Masuk pakai **magic link** (email) atau **Google**
- Task, jadwal, dan kamus pribadi ikut tersinkron
- Perubahan dari perangkat lain masuk **realtime**
- Indikator sync cuma muncul kalau ada yang perlu kamu tahu — diam kalau semua aman

</details>

<details>
<summary><b>Lain-lain</b></summary>

<br>

- **Mode terang & gelap**, ikut setelan sistem
- **Ctrl/Cmd + K** — command palette; cari task, pindah halaman, ganti tema
- **n** — langsung ke chat buat nulis
- Antarmuka Indonesia sepenuhnya, termasuk pesan error

</details>

---

## Contekan perintah

> Semua contoh di bawah **beneran jalan** — diambil dari kamus perintah yang dipakai kode.

<details open>
<summary><b>Nambah</b></summary>

<br>

| Kamu ketik | Hasilnya |
|---|---|
| `tambahin bikin laporan besok jam 9` | Task besok 09:00 |
| `jadwalin rapat sama klien rabu jam 3` | Task Rabu 15:00 |
| `ingetin bayar listrik tanggal 25` | Task tgl 25 + penanda pengingat |
| `olahraga tiap senin rabu jumat` | Task berulang |
| `revisi vlog besok jam 2 !p1 #konten 90m` | Lengkap dengan prioritas, label, estimasi |

**Aba-aba itu wajib.** Bikin task cuma otomatis kalau ada kata perintah
(`tambahin`, `jadwalin`, `ingetin`, …) **atau** ada waktu (`besok jam 9`).
Selain itu sistem nanya dulu:

```
> beli kopi
  Mau gue simpen "Beli kopi" jadi task? (ya / batal)
```

Sengaja begitu — bikin task itu perubahan data, dan itu gak boleh kejadian cuma
gara-gara kamu ngetik sesuatu yang mirip judul.

</details>

<details>
<summary><b>Lihat & cari</b></summary>

<br>

| Kamu ketik | Hasilnya |
|---|---|
| `apa aja agenda gw hari ini?` | Semua isi hari ini |
| `tampilin task besok` | Agenda besok |
| `jadwal gw minggu depan` | Rentang sepekan |
| `tampilin task yang belum selesai` | Filter status |
| `tampilin task yang udah selesai` | Yang sudah dicentang |
| `tampilin task yang telat` | Lewat tenggat & belum selesai |
| `tampilin semua rapat gw` | Semua yang masuk kategori rapat |
| `tampilin agenda zoom gw` | Cuma yang Zoom |
| `tampilin semua jadwal gw` | Termasuk yang sudah lewat |

**Task dan jadwal itu satu hal yang sama.** Kata `task`, `jadwal`, dan `agenda`
semuanya nyari hal yang sama — kamu gak perlu ingat sesuatu itu "dulu dibikin
pakai kata apa".

Kategori yang dikenal: `rapat`, `kuliah`, `olahraga`, `medis`, `sosial`.

</details>

<details>
<summary><b>Ubah, selesaikan, hapus</b></summary>

<br>

| Kamu ketik | Hasilnya |
|---|---|
| `selesaiin laporan` | Tandai selesai |
| `kelarin task laporan` | Sama |
| `batalin selesai laporan` | Balikin jadi belum selesai |
| `ubah task laporan jadi jam 9` | Ganti jam |
| `pindahin rapat senin ke selasa` | Pindah hari |
| `hapus meeting besok` | Hapus (dengan konfirmasi) |
| `hapus semua meeting minggu ini` | Massal (konfirmasi + daftar lengkap) |
| `batal` | Batalkan, atau kembalikan yang baru dihapus |

</details>

<details>
<summary><b>Cek waktu kosong</b></summary>

<br>

| Kamu ketik | Hasilnya |
|---|---|
| `besok jam 3 gw kosong ga?` | Kosong / sebut agenda yang bentrok |
| `hari ini sore gw luang ga?` | Cek per bagian hari |

Task tanpa jam (all-day) **tidak** dianggap menutup slot — punya tenggat besok
bukan berarti kamu sibuk seharian.

</details>

<details>
<summary><b>Bantuan</b></summary>

<br>

Ketik `bisa apa aja` atau `bantuan` — muncul daftar kemampuan lengkap dengan
contoh yang bisa langsung diketuk.

</details>

---

## Kamus pribadi

Punya istilah sendiri yang gak dikenal sistem? Ajarin.

```
> besok gw ada clientan gak?
  Gue belum ngerti "clientan", jadi belum nemu apa-apa besok.
  Mau kasih tau artinya?   [ ajarin "clientan" ]  [ gak usah ]

> ajarin "clientan"
  Oke. Kalau kamu bilang "clientan", artinya apa?

> meeting client
  Simpan ini?

    clientan  →  meeting client

    Contoh: "besok ada clientan gak?"
          → lihat agenda besok yang judulnya mengandung "meeting client"

    (ya / batal)

> ya
  Sip. Mulai sekarang "clientan" = meeting client.
```

Setelah itu, `clientan` langsung kepakai di perintah apa pun.

<details>
<summary><b>Cara kerjanya — dan kenapa ini bukan "AI belajar"</b></summary>

<br>

Kamus pribadi itu **makro teks**, bukan mesin aturan. Dia jalan sebelum parser
dan gak pernah ngajarin parser hal baru — dia cuma **menulis ulang kalimat kamu
jadi kalimat yang parser sudah mengerti.**

| | |
|---|---|
| **Sumber arti** | Ditulis kamu, harfiah — sistem gak pernah nyimpulin sendiri |
| **Bisa diperiksa** | Ya, satu baris: `clientan → meeting client` |
| **Bisa dibetulkan** | Edit sekali, benar selamanya |
| **Ekspansi** | Sekali jalan, tidak rekursif — siklus mustahil terjadi |
| **Privasi** | Berhenti di baris database milik kamu sendiri |

**Pengaman yang dipasang:**

- Kata perintah bawaan (`hapus`, `batal`, `ya`, `ajarin`) **tidak bisa** ditimpa —
  kalau bisa, kamu bakal terkunci di dalam percakapan sendiri
- Kata waktu (`besok`, `senin`, `jam`) juga dikunci — salah waktu itu kegagalan
  paling mahal
- Kalau istilahmu menimpa kata bawaan, kamu **diperingatkan dengan contoh kalimat
  nyata**, bukan istilah teknis
- Arti yang menghapus data dapat peringatan tegas, dan tetap minta konfirmasi tiap dipakai

**Mengelola:**

| Perintah | Hasil |
|---|---|
| `tampilin vocabulary gw` | Lihat semua istilah |
| `hapus vocabulary clientan` | Hapus satu |
| `kalau gw bilang X, maksudnya Y` | Ajarin langsung, tanpa dipandu |

</details>

---

## Mulai pakai

### Yang dibutuhkan

- **Node.js** ≥ 20
- **pnpm** 11 (`corepack enable` sudah cukup)
- Akun **Supabase** gratis (opsional — tanpa ini app tetap jalan penuh, cuma lokal)

### Jalanin

```bash
git clone https://github.com/k41ts/hakaitask.git
cd hakaitask
pnpm install
pnpm dev
```

Buka `http://localhost:5173`. **Tanpa setup Supabase pun app langsung jalan** —
semua fitur lokal hidup, cuma tidak ada sinkronisasi antar perangkat.

<details>
<summary><b>Nyalain sinkronisasi (opsional)</b></summary>

<br>

1. Bikin project di [supabase.com](https://supabase.com)
2. Jalankan migrasi di `supabase/migrations/` secara berurutan lewat SQL Editor
3. Salin `.env.example` jadi `.env.local`, isi dua nilai ini:

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxxxxxxxxxx
```

Kunci *publishable* memang aman dipajang di client — datamu dijaga
**Row Level Security**, bukan oleh kerahasiaan kunci. Jangan pernah menaruh
`service_role` key di sini.

</details>

### Perintah lain

| Perintah | Fungsi |
|---|---|
| `pnpm dev` | Server pengembangan |
| `pnpm build` | Build produksi |
| `pnpm test` | Jalankan semua tes (254) |
| `pnpm typecheck` | Periksa tipe seluruh workspace |

---

## Cara kerjanya

### Alur satu giliran chat

```mermaid
flowchart TD
    A["Ketikan kamu"] --> B{"Lagi ada<br/>pertanyaan tertunda?"}
    B -->|ya| C["Jawab itu dulu<br/>(pilihan / ya-tidak)"]
    B -->|tidak| D["Ekspansi kamus pribadi<br/>(sekali jalan)"]
    D --> E["Deteksi kata kerja<br/>lihat / hapus / selesaiin / …"]
    E --> F["Ambil rentang waktu,<br/>status, kategori, kata kunci"]
    F --> G{"Sudah jelas?"}
    G -->|ambigu| H["Tanya: yang mana?"]
    G -->|kurang lengkap| I["Tanya bagian yang kurang"]
    G -->|merusak| J["Minta konfirmasi"]
    G -->|jelas| K["Jalankan"]
    K --> L["Balasan dari template"]
```

Yang bikin ini bisa dipercaya: **mesinnya murni**. `chatTurn()` tidak menyentuh
database, tidak memanggil jaringan, bahkan tidak membuat ID. Dia membaca keadaan
lalu mengembalikan **deskripsi** perubahan; lapisan aplikasi yang menjalankannya.

Akibatnya seluruh perilaku chat bisa diuji tanpa React, tanpa browser, tanpa
jaringan — dan semua penulisan tetap lewat satu pintu, jadi tidak ada jalur yang
bisa lolos dari offline-first.

### Struktur repo

```
hakaitask/
├─ apps/web/              React + Vite + Tailwind v4
│  ├─ components/         ChatView, CalendarView, Dashboard, …
│  └─ lib/                sync, mapping, chat bridge, tema
├─ packages/
│  ├─ core/               TypeScript murni — TANPA React/DOM
│  │  ├─ parser/          Parser bahasa alami + kamus (lexicon.id.json)
│  │  ├─ chat/            Mesin chat: intent, rentang, query, kamus pribadi
│  │  ├─ store/           State Zustand + outbox
│  │  └─ sync/            Antrean mutasi + resolusi konflik
│  └─ tokens/             Token desain (warna, tipografi, motion)
└─ supabase/migrations/   Skema + Row Level Security
```

**Aturan keras:** `packages/core` tidak boleh mengimpor React, React Native, atau
DOM. Itu yang bikin logikanya bisa dipakai ulang di mobile nanti tanpa ditulis ulang.

### Bacaan lebih dalam

| Dokumen | Isi |
|---|---|
| [`PLAN.md`](PLAN.md) | Perencanaan induk: model data, mesin prioritas, design system, log keputusan |
| [`PLAN-CHAT.md`](PLAN-CHAT.md) | Rancangan chat: daftar intent, penanganan ambiguitas, edge case |
| [`PLAN-VOCAB.md`](PLAN-VOCAB.md) | Rancangan kamus pribadi: tipe, keamanan, konflik |

Ketiganya menyimpan **alasan** di balik keputusan, termasuk yang **dibatalkan**
dan kenapa — bagian yang biasanya hilang begitu kode ditulis.

---

## Status: apa yang udah jadi

<details open>
<summary><b>✅ Sudah jalan</b></summary>

<br>

- Chat sebagai halaman utama — bikin, cari, ubah, centang, hapus, undo
- Parser bahasa alami Indonesia + token bertanda
- Kamus pribadi: ajarin, lihat, hapus, dengan pengaman
- Cek ketersediaan waktu (per titik jam)
- Dashboard dengan Focus Card, kalender bulanan
- Sinkronisasi offline-first + realtime, konflik LWW per field
- Mode terang/gelap, command palette
- **254 tes otomatis** — termasuk suite khusus yang menguji tiap contoh di README ini

</details>

<details>
<summary><b>🚧 Belum dibuat</b></summary>

<br>

Jujur soal ini lebih berguna daripada daftar fitur yang panjang tapi bohong:

- **Time blocking** — timeline harian, cari celah kosong, isi otomatis
- **Focus mode + Pomodoro**
- **Review mingguan** & statistik
- **Notifikasi / pengingat** — token `*30m` sudah tersimpan, tapi belum ada yang membunyikan
- **Halaman Setelan** — termasuk pengelolaan kamus lewat UI (sekarang lewat chat)
- **Aplikasi mobile** — arsitekturnya sudah disiapkan, tapi belum dikerjakan
- **PWA** — belum bisa di-install ke home screen

</details>

---

<div align="center">

**Dibuat buat dipakai sendiri, bukan buat dipamerin.**

Kalau ada yang aneh atau salah baca, itu bug — dan bug di parser kamus
biasanya cukup dibetulkan dengan menambah satu baris.

</div>
