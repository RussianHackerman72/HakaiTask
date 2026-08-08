# HaKaiTask — Planning: Kamus Pribadi (Custom Vocabulary)

> Dokumen perencanaan. **Belum ada kode yang ditulis.**
> Pendamping `PLAN.md` §6.1.7 dan `PLAN-CHAT.md`. Penomoran §1–§20 ngikutin
> urutan brief.
>
> **100% non-AI.** Tanpa LLM, tanpa embedding, tanpa vector search, tanpa ML.
> "Belajar" di sini artinya: **user nulis aturan, sistem nyimpen aturan, parser
> baca aturan.** Sistem gak pernah nyimpulin apa pun sendiri.

---

## §0 Temuan & keputusan yang nunggu

### 0.1 Fitur ini udah setengah ada di kode lo

Ini ngubah bentuk plan-nya secara signifikan — kita **nyambungin kabel yang udah
kepasang**, bukan bangun dari nol.

| Sudah ada | Lokasi | Status |
|---|---|---|
| Tabel `user_lexicon` (`dari`, `ke`, `tipe`, unique per user) | `0001_init.sql:96` | ✅ Ada, termasuk RLS |
| Tipe `UserLexiconEntry` | `types.ts:141` | ✅ Ada |
| Hook parser `ParseOptions.userLexicon` | `parser/index.ts:79` | ✅ Ada |
| Penerapan di `applySlang()` (kamus user menang atas bawaan) | `parser/index.ts:245` | ✅ Ada |
| Deteksi kata asing (`unmatched` / `findNearMisses`) | `parser/index.ts:940` | ✅ Ada |
| Rencana produk "Kamus yang Tumbuh Sendiri" | `PLAN.md` §6.1.7 | ✅ Ada |
| **Pemanggil yang ngisi `userLexicon`** | — | ❌ **Nol.** Hook-nya nganggur |
| Sync `user_lexicon` | `sync.ts` | ❌ Cuma tabel `tasks` (sama kayak `busy_blocks`) |
| Dukungan frasa multi-kata | `applySlang` per-token | ❌ Cuma 1 kata |
| Tipe mapping selain slang | `check (tipe in (...))` | ❌ 4 tipe lama, gak cocok |

### 0.2 Perbedaan penting antara §6.1.7 dan yang lo minta sekarang

| | `PLAN.md` §6.1.7 | Brief ini |
|---|---|---|
| Bentuk | 1 kata → 1 kata | **frasa → makna** |
| Pemicu | Layar setelan, dari log kegagalan | **Lewat chat, langsung** |
| Isi | Koreksi ejaan/slang | **Alias, aksi, filter kategori** |

Jadi ini **perluasan** §6.1.7, bukan fitur tandingan. Tabelnya dipakai ulang,
kolomnya ditambah.

### 0.3 Decision Required

Semua sudah diputuskan **9 Agustus 2026** — dipakai sebagai dasar implementasi.

| # | Pertanyaan | Putusan |
|---|---|---|
| **V1** | Boleh gak kamus user nimpa kata bawaan yang **bukan** reserved? Contoh nyata: `beresin` sekarang terdaftar sebagai kata benda task | ✅ **Boleh, tapi diperingatin saat diajarin.** Blokir cuma buat reserved (§6) |
| **V2** | Ekspansi di posisi **judul** ikut berubah atau tetap kata asli user? | ✅ **Tetap kata asli.** Mekanismenya udah ada (§5.4) |
| **V3** | Hitung pemakaian tiap entri? | ✅ **Lokal aja, jangan disync.** Kalau disync, tiap parse jadi tulisan ke outbox |
| **V4** | Batas jumlah entri per user? | ✅ **200.** Cukup longgar, tapi nutup penyalahgunaan |
| **V5** | Kamus ikut TTL 1 jam kayak riwayat chat? | ✅ **Enggak.** Kamus itu permanen; yang fana cuma percakapan |

---

## §1 Konsep produk

**Satu kalimat:** user bisa ngedaftarin singkatannya sendiri, dan sistem
memperlakukan singkatan itu **persis seperti** kalimat panjang yang diwakilinya.

Yang bikin ini beda dari "AI yang belajar":

| | AI yang belajar | Kamus pribadi |
|---|---|---|
| Sumber arti | Disimpulkan model | **Ditulis user, harfiah** |
| Bisa diperiksa | Enggak | **Ya — bisa dibaca, satu baris** |
| Bisa dibetulkan | Nunggu retrain | **Edit satu baris, langsung benar selamanya** |
| Bisa salah diam-diam | Sering | **Gak bisa** — arti persis seperti yang ditulis |
| Offline | Enggak | **Ya** |

Ini penerusan langsung argumen `PLAN.md` §11.2. Ide intinya bukan "sistem jadi
pinter", tapi **"sistem jadi punya kamus milik lo"**.

**Slogan desain internal:** *kamus itu makro, bukan tebakan.*

---

## §2 User flow

Tiga pintu masuk, dari yang paling sering ke paling jarang:

```
① REAKTIF (paling penting)
   User ngetik perintah → ada kata asing → hasil kosong
   → sistem nawarin ngajarin, tepat di momen kebutuhannya nyata

② EKSPLISIT
   "kalau gw bilang clientan, maksudnya meeting sama client"
   → langsung diproses jadi entri

③ TERKELOLA
   Setelan → Kamus Saya → tambah / ubah / hapus
```

Jalur ① yang paling menentukan. Orang gak bakal buka setelan buat ngajarin
kamus — mereka ngajarin **pas lagi kesel karena gak dimengerti**. Momen itu yang
harus ditangkep.

Aturan penting biar gak ngeselin: **jangan nawarin ngajarin tiap ada kata
asing.** Cuma tawarin kalau kata asing itu **bikin hasil kosong** di perintah
non-CREATE (§11).

---

## §3 Teaching flow

### 3.1 Pemicu

| Cara | Contoh | Deteksi |
|---|---|---|
| Pola langsung | "kalau gw bilang **clientan**, maksudnya **meeting sama client**" | Ada penanda `kalau…bilang` + pemisah `maksudnya` |
| Pola pendek | "**clientan** artinya **meeting sama client**" | Pemisah `artinya` / `itu` |
| Verba | "ajarin", "gw mau ngajarin lu sesuatu" | Kata `ajarin` → mode dipandu |
| Tombol | Dari tawaran setelah hasil kosong | Frasa udah keisi otomatis |

Pemisah yang dikenali: `maksudnya`, `artinya`, `itu`, `=`, `berarti`.
Semuanya masuk `lexicon.chat.id.json`, bukan hardcode.

### 3.2 Mode dipandu (kalau cuma bilang "ajarin")

```
User:   gw mau ngajarin lu sesuatu
Sistem: Boleh. Kata atau istilahnya apa?          ← pending: teach.phrase
User:   clientan
Sistem: Oke. Kalau kamu bilang "clientan", artinya apa?   ← pending: teach.meaning
User:   semua meeting sama client
Sistem: [pratinjau konfirmasi — lihat §12]
```

Satu slot pending per giliran, ngikutin mesin state `PLAN-CHAT.md` §8.1.

### 3.3 Klarifikasi kalau arti gak jelas

Arti yang dikasih **harus bisa diparse jadi sesuatu yang bermakna**. Kalau
enggak, jangan disimpan.

| Kondisi arti | Balasan |
|---|---|
| Kosong / cuma partikel | "Artinya belum kebaca. Coba pakai kalimat yang biasa kamu ketik, misal 'meeting sama client'." |
| Cuma kata asing lagi | "'{x}' juga belum gue ngerti. Coba pakai kata yang lebih umum." |
| Ngandung frasa yang lagi didefinisikan (siklus) | "Artinya gak boleh ngandung '{frasa}' itu sendiri." |
| Kepanjangan (>6 kata) | "Kepanjangan. Kamus itu buat singkatan, bukan kalimat utuh." |
| Ngandung kata reserved berbahaya | Lihat §16 |

### 3.4 Batal

`batal`, `gajadi`, `udahlah`, `lupain` → buang pending, jangan simpan apa pun.
Berlaku di tahap mana pun. Pending kedaluwarsa 5 menit (konsisten `PLAN-CHAT.md`).

### 3.5 Lihat kamus

"vocabulary gw", "kamus gw", "kata yang udah gw ajarin" → intent `LIST_VOCAB`.

---

## §4 Jenis vocabulary

### 4.1 Rekomendasi inti: satu mekanisme, bukan tiga

Brief ngebayangin tiga tipe (alias / aksi / filter) sebagai **tiga jalur parser
berbeda**. Gue saranin **jangan** — cukup satu mekanisme: **ekspansi teks ke
frasa kanonik**.

```
clientan       →  "meeting client"      (kebetulan jadi filter)
beresin        →  "selesaiin"           (kebetulan jadi aksi)
urusan kampus  →  "jadwal kuliah"       (kebetulan jadi kategori)
```

Ketiganya **mekanisme yang sama persis**: ganti frasa, lalu jalanin parser
normal. "Tipe" cuma jadi label buat ditampilin di UI, **bukan cabang logika**.

Kenapa ini menang telak:

| Alasan | Penjelasan |
|---|---|
| **Nol jalur parser baru** | Ekspansi terjadi sebelum deteksi intent. Semua di bawahnya gak berubah sama sekali |
| **Komposisi gratis** | "besok ada **clientan** gak?" → tanggal, bentuk tanya, dan filter jalan bareng tanpa kode tambahan |
| **Bisa diperlihatkan** | Bisa ditampilin ke user: `clientan → meeting client`. Coba lakuin itu ke mapping terstruktur |
| **Keamanan otomatis diwarisi** | Hasil ekspansi lewat validasi & konfirmasi yang sama (§16) |
| **Nambah tipe gak ngerombak parser** | §14 |

### 4.2 Tipe (label UI + aturan validasi, bukan cabang parser)

| Tipe | Arti | Contoh | Validasi khusus |
|---|---|---|---|
| `alias` | Kata benda / entitas | clientan → meeting client | Hasil ekspansi gak boleh ngandung verba merusak |
| `aksi` | Kata kerja | beresin → selesaiin | Hasilnya harus ngandung verba yang dikenal |
| `filter` | Kategori / penyaring | urusan kampus → jadwal kuliah | Hasilnya harus kena grup topik atau kata kunci |

Ketiganya disimpan sama: `dari` → `ke`. Tipe cuma nentuin **pemeriksaan saat
diajarin** dan **ikon di daftar**.

### 4.3 Tipe lain yang layak (Fase 2)

| Tipe | Contoh | Kenapa nanti |
|---|---|---|
| `shortcut` | "rutinan" → "olahraga tiap hari kerja jam 6 pagi" | Ekspansi ke perintah CREATE utuh. Berguna, tapi butuh peringatan ekstra |
| `buang` | "btw", "anjay" → dibuang | Udah didukung `tipe: 'buang'` yang lama |

Yang **gak** gue saranin: tipe yang butuh parameter runtime (mis. "clientan {n}
minggu terakhir"). Itu udah jadi bahasa pemrograman mini — lihat §19.

---

## §5 Arsitektur parser

### 5.1 Evaluasi alur yang lo usulkan

Usulan lo:

```
INPUT → NORMALIZER → CUSTOM VOCAB RESOLUTION → INTENT → ENTITY → VALIDATION → ACTION
```

**Ini benar,** dan posisi resolusinya udah tepat: sebelum intent. Dua koreksi:

1. **Normalizer harus dipecah dua.** Normalisasi bentuk (huruf kecil, buang tanda baca) jalan **sebelum** resolusi — kalau enggak, "Clientan?" gak bakal kena. Tapi normalisasi *slang bawaan* harus jalan **sesudah** — biar kamus user menang.
2. **Pengecekan reserved harus sebelum resolusi**, kalau enggak kamus user bisa nyulik perintah bawaan (§6).

### 5.2 Alur final

```
INPUT
  ↓
① NORMALISASI BENTUK        huruf kecil, buang tanda baca, tokenisasi
  ↓                          (pakai ulang normalize()/tokenize() yang ada)
② PENJAGA RESERVED           token reserved ditandai "kebal", gak bisa diekspansi
  ↓
③ RESOLUSI KAMUS USER        cocok frasa terpanjang-dulu, SEKALI JALAN
  ↓                          menghormati rentang terkunci (teks dalam kutip)
④ SLANG BAWAAN               applySlang() yang ada, sekali jalan
  ↓
⑤ DETEKSI INTENT             gak berubah
⑥ EKSTRAKSI ENTITAS          gak berubah
⑦ VALIDASI                   gak berubah
⑧ AKSI + BALASAN             + tampilkan asal-usul ekspansi
```

Tahap ③ satu-satunya yang beneran baru. Tahap ⑤–⑧ **nol perubahan** — itu
seluruh nilai dari pendekatan ekspansi.

### 5.3 Ekspansi TIDAK rekursif — disengaja

Kamus user jalan **tepat sekali**. Hasil ekspansi **gak** diperiksa lagi ke
kamus user.

| Akibat | Nilai |
|---|---|
| Siklus mustahil secara konstruksi | `a→b→a` gak bisa terjadi, gak perlu deteksi siklus |
| Hasil selalu bisa ditebak | Satu langkah, bisa ditampilin utuh ke user |
| Rantai tersembunyi mustahil | User gak bisa bikin makro bertingkat yang gak dia sadari |

Yang direlakan: `a → b` dan `b → c` gak bikin `a → c`. Itu **fitur**, bukan
keterbatasan. Kepastian lebih berharga daripada keluwesan di sini.

### 5.4 Judul memakai kata asli — mekanismenya udah ada [V2]

Ini detail yang paling gampang bikin bug, dan kabar baiknya arsitektur yang ada
udah nyelesain buat 1 kata. `Token` punya tiga bidang:

| Bidang | Isi | Dipakai buat |
|---|---|---|
| `raw` | teks asli persis | — |
| `display` | teks asli rapi | **`buildTitle()`** |
| `norm` | bentuk ternormalisasi + terekspansi | **pencocokan** |

`applySlang` cuma nulis ke `norm`, dan `buildTitle()` baca `display`. Jadi
"tambahin task **clientan**" bikin task berjudul **"clientan"** — kata user
sendiri — walaupun pencocokan pakai "meeting client". Persis yang diinginkan.

**Yang perlu perhatian:** ekspansi multi-kata mecah pemetaan 1:1 token. Satu
token `clientan` jadi dua token `meeting client`. Perlu diputuskan
representasinya — saran: satu token dengan `norm` berisi frasa, dan pencocokan
frasa (`matchPhrase`) yang udah ada dibikin sadar-frasa. **Tandai buat
diputuskan saat implementasi**, jangan diimprovisasi.

---

## §6 Prioritas resolusi

### 6.1 Evaluasi hierarki yang lo usulkan

Usulan lo: `BUILT-IN > CUSTOM > NORMAL PARSER > UNKNOWN`.

Arahnya benar, tapi terlalu kasar: "built-in" itu bukan satu lapisan. Kata
`hapus` dan kata `beresin` dua-duanya bawaan, tapi risikonya beda jauh. Ngunci
dua-duanya bikin kamus jadi gak berguna; ngebuka dua-duanya bikin bahaya.

### 6.2 Hierarki final

```
0. STATE PENDING          "1" = pilihan, bukan jam            (PLAN-CHAT §8.1)
1. RESERVED (terkunci)    gak bisa diekspansi, titik
2. KAMUS USER             frasa terpanjang menang
3. KAMUS BAWAAN           slang, kata benda, dst.
4. TIDAK DIKENAL          → tawarin ngajarin (§11)
```

### 6.3 Daftar reserved (gak bisa ditimpa selamanya)

| Golongan | Contoh | Kenapa |
|---|---|---|
| Verba merusak | hapus, buang | Menyulik ini = bahaya nyata |
| Meta percakapan | ya, iya, tidak, batal, gajadi, ajarin, lupain | Kalau ini ditimpa, user **gak bisa keluar** dari percakapan |
| Ordinal | nomor, pertama, kedua, … | Bikin daftar pilihan gak bisa dijawab |
| Inti waktu | besok, lusa, kemarin, hari, minggu, bulan, tanggal, jam, pukul, nama hari, nama bulan | Interpretasi waktu harus stabil mutlak |
| Angka | semua token numerik | Sama seperti di atas |

Yang **bukan** reserved (boleh ditimpa dengan peringatan): kata benda seperti
`beresin`, `rapat`, `laporan`, dan verba non-merusak seperti `tampilin`.

### 6.4 Kenapa "meta percakapan" wajib dikunci

Ini yang paling gampang kelewat. Kalau user ngajarin `batal` → sesuatu, dia
kehilangan satu-satunya cara mundur dari konfirmasi hapus massal. **Kamus gak
boleh bisa ngunci user di dalam percakapannya sendiri.**

### 6.5 Frasa terpanjang menang

`kampus` → "kuliah" dan `urusan kampus` → "jadwal kuliah" dua-duanya ada?
Cocokin **`urusan kampus` duluan**. Deterministik, gak perlu skor.
`findPhrase()` yang ada udah pakai prinsip ini.

---

## §7 Integrasi ke intent & entitas

Karena ekspansi terjadi **sebelum** deteksi intent, pengaruhnya lewat satu jalur
saja: mengubah token. Tabel di bawah nunjukin bahwa gak ada satu pun tahap hilir
yang perlu tau soal kamus.

| Terpengaruh | Caranya | Perubahan kode di tahap itu |
|---|---|---|
| **Intent** | Ekspansi bisa memunculkan verba: `beresin` → `selesaiin` → `COMPLETE_TASK` | **Nol** |
| **Entitas** | Ekspansi bisa memunculkan kata benda objek: `clientan` → `meeting` → `kind: schedule` | **Nol** |
| **Filter** | Ekspansi bisa kena grup topik: `urusan kampus` → `jadwal kuliah` → `topic: kuliah` | **Nol** |
| **Kategori** | Sama seperti filter — kategori itu grup topik (`PLAN-CHAT` §7.1) | **Nol** |
| **Aksi** | Turunan dari intent | **Nol** |
| **Tanggal/jam** | ⚠️ **Bisa terpengaruh, dan ini bahaya** | Lihat bawah |

### 7.1 Kenapa waktu diperlakukan khusus

Kalau user ngajarin `pagian` → "besok pagi", maka "clientan **pagian**" ikut
bawa tanggal. Itu bermanfaat — tapi juga artinya **kamus bisa menggeser waktu**,
dan salah waktu itu kegagalan senyap paling mahal di app ini.

Aturan pengaman:

1. Kata waktu inti itu reserved (§6.3) — jadi kamus gak bisa **mendefinisikan ulang** "besok".
2. Kamus **boleh** menghasilkan kata waktu (`pagian` → "besok pagi") — ini sah dan berguna.
3. Kalau hasil ekspansi ngandung waktu, konfirmasi saat diajarin **wajib nampilin contoh terhitung**: *"'pagian' bakal jadi besok 08:00"*. Bikin efek waktunya kelihatan sebelum disimpan, bukan pas kejadian.

---

## §8 Desain database

### 8.1 Evaluasi skema usulan lo

Usulan lo (`phrase`, `mapping_type`, `mapping_value`, `metadata`) itu skema
generik yang wajar. Tapi **tabelnya udah ada** dan bentuknya mirip — bikin tabel
kedua cuma bakal bikin dua sumber kebenaran. Perluas yang ada.

| Kolom usulan | Padanan yang udah ada | Putusan |
|---|---|---|
| `phrase` | `dari` | **Pakai yang ada.** Ganti nama = churn tanpa manfaat |
| `mapping_value` | `ke` | **Pakai yang ada** |
| `mapping_type` | `tipe` | **Perluas** daftar nilainya |
| `metadata` | — | **Tambah** sebagai `jsonb`, tapi kosong di MVP (§19) |

### 8.2 Skema final

```sql
alter table user_lexicon
  add column updated_at timestamptz not null default now(),
  add column deleted_at timestamptz;                    -- tombstone, konsisten tasks

alter table user_lexicon drop constraint user_lexicon_tipe_check;
alter table user_lexicon add constraint user_lexicon_tipe_check
  check (tipe in ('alias','aksi','filter','slang','buang'));

-- unique lama bentrok sama soft delete: entri terhapus mestinya gak nahan frasa
alter table user_lexicon drop constraint user_lexicon_user_id_dari_key;
create unique index user_lexicon_aktif
  on user_lexicon (user_id, dari) where deleted_at is null;

create trigger user_lexicon_touch
  before update on user_lexicon
  for each row execute function touch_updated_at();      -- fungsi udah ada

alter publication supabase_realtime add table user_lexicon;
```

Keputusan yang menyertainya:

| Pertanyaan lo | Putusan | Alasan |
|---|---|---|
| Kamus bawaan di DB? | **Enggak.** Tetap di `lexicon.id.json` yang dibundel | Jalan offline, ikut versi app, nol query saat boot |
| Versioning? | **Enggak.** Cukup `updated_at` | Riwayat perubahan kamus gak ada yang bakal baca. Kompleksitas tanpa pembeli |
| Soft atau hard delete? | **Soft.** | Wajib — sync pakai tombstone. Hard delete bikin entri "hidup lagi" dari device lain |
| Deteksi konflik di DB? | **Enggak, di klien.** | Butuh nampilin peringatan yang bisa dibaca *sebelum* simpan. Constraint DB cuma bisa nolak |
| `dari` disimpan apa adanya? | **Ternormalisasi** (huruf kecil, spasi rapat) | Unique index-nya baru bermakna kalau begitu |

### 8.3 Konsekuensi sync

`user_lexicon` **belum ikut sync** — masalah yang sama persis dengan
`busy_blocks` (`PLAN-CHAT.md` T6). Karena lo udah mutusin sync `busy_blocks`
masuk MVP (P1), `sync.ts` bakal digeneralisasi dari "cuma tasks" jadi
multi-entitas. **Kamus numpang di pekerjaan itu** — kalau enggak, user ngajarin
di HP dan laptopnya tetap bego.

---

## §9 Arsitektur service

**Gak ada backend, dan gak boleh ada.** Sama seperti `PLAN-CHAT.md` §18 dan
`PLAN.md` §11.1/§11.2.

| Lapisan | Tugas | Tempat |
|---|---|---|
| Resolusi | Cocokin frasa, ekspansi | `packages/core/src/chat/vocab.ts` — murni |
| Validasi | Reserved, siklus, tipe | `packages/core` — murni |
| Penyimpanan | Baca/tulis entri | Store Zustand → outbox → Supabase |
| Sync | Antar device | `sync.ts` yang digeneralisasi |

Resolusi terjadi **di device, sinkron, tanpa jaringan.** Kamus dimuat sekali
saat boot ke memori (maks 200 entri — kecil), diperbarui saat berubah.

Kontraknya murni, konsisten `chatTurn()`:

```ts
function resolveVocab(
  tokens: Token[],
  vocab: readonly VocabEntry[],
): { tokens: Token[]; applied: AppliedExpansion[] };
```

`applied` itu yang dipakai buat nampilin asal-usul ("dari kamus kamu:
clientan → meeting client") — penting buat kepercayaan dan buat debugging.

---

## §10 Penanganan konflik

| Konflik | Kapan ketahuan | Perlakuan |
|---|---|---|
| **Frasa = reserved** | Saat diajarin | **Tolak.** "'hapus' itu perintah bawaan, gak bisa dipakai." Kasih saran alternatif |
| **Frasa duplikat (aktif)** | Saat diajarin | Tawarin **timpa**: "'clientan' udah ada artinya 'meeting client'. Ganti jadi '{baru}'?" |
| **Frasa duplikat (terhapus)** | Saat diajarin | Diam-diam dihidupkan lagi + diperbarui. Jangan bikin user mikirin tombstone |
| **Nimpa kata bawaan non-reserved** | Saat diajarin | **Peringatkan, jangan blokir** [V1]. Lihat bawah |
| **Frasa tumpang-tindih** (`kampus` vs `urusan kampus`) | Saat resolusi | Terpanjang menang (§6.5). Bukan error |
| **Arti ngandung frasa itu sendiri** | Saat diajarin | Tolak (§3.3) |
| **Satu frasa dua arti** | — | **Gak didukung.** Satu frasa = satu arti (§19) |

### 10.1 Contoh nimpa yang nyata: `beresin`

Contoh dari brief lo sendiri ternyata konflik: `beresin` **udah** terdaftar
sebagai kata benda task di kamus bawaan. Jadi ini bukan skenario karangan:

```
User:   kalau gw bilang beresin, maksudnya tandain selesai
Sistem: Catatan: "beresin" sekarang gue baca sebagai kata benda,
        jadi "beresin meja" = bikin task "beresin meja".
        Kalau diajarin, kalimat itu bakal jadi perintah nyelesaiin task.
        Lanjut? (ya / batal)
```

Peringatan ini pakai **contoh kalimat nyata**, bukan istilah teknis. User gak
peduli soal "nounTask" — dia peduli kalimatnya bakal beda arti.

---

## §11 Penanganan kata tak dikenal

### 11.1 Kapan sistem BOLEH nawarin ngajarin

Ini penentu apakah fitur ini kepake atau ngeselin. Aturannya sempit:

> Tawarin ngajarin **cuma kalau** ketiganya benar:
> 1. Intent-nya **bukan** CREATE, **dan**
> 2. Ada token sisa yang gak dikenal siapa pun, **dan**
> 3. Perintahnya **balik nol hasil**

Kenapa syarat ①: di perintah CREATE, kata asing itu **judul** — itu normal dan
benar. "tambahin task clientan" gak boleh mancing tawaran apa pun.

Kenapa syarat ③: kalau hasilnya ada, user dapet yang dia mau. Nawarin ngajarin
di situ cuma gangguan.

### 11.2 Balasan

```
User:   besok ada clientan gak?
Sistem: Gue belum ngerti "clientan", jadi belum nemu apa-apa buat besok.
        Mau kasih tau artinya?  [ ajarin "clientan" ]  [ gak usah ]
```

Kalau diketuk, mode teaching mulai dengan frasa **udah keisi** — user tinggal
ngisi artinya. Ini bikin ①→② mulus, dan itu jalur yang paling sering kepake.

### 11.3 Jangan nanya dua kali

Kalau user nolak buat satu frasa, **jangan tawarin lagi frasa itu** (catat
lokal, jangan disync). Ditanyain hal yang sama berulang itu bikin fitur kerasa
bego — persis kesan yang kita hindari.

### 11.4 Kata mirip

Sebelum nawarin ngajarin, cek dulu **mirip** sama entri yang udah ada:
"Maksudnya 'clientan'?" `editDistanceAtMost1()` udah ada.

⚠️ **Bug yang nunggu:** `knownWordsCache` (`parser/index.ts:899`) dibangun sekali
di level modul, **gak pernah** ngikutin kamus user, dan **gak pernah**
di-invalidasi. Begitu kamus bisa berubah saat runtime, cache ini jadi basi.
Harus dibenerin bareng fitur ini.

---

## §12 Sistem konfirmasi

Simpan **selalu** lewat konfirmasi. Pengeditan kamus itu jarang tapi berdampak
lama — beda dari nyentang task.

Konfirmasi wajib nampilin **tiga** hal, bukan cuma pemetaannya:

```
Sistem: Simpan ini?

        clientan  →  meeting client

        Contoh: "besok ada clientan gak?"
              → lihat jadwal besok yang judulnya mengandung "meeting client"

        (ya / batal)
```

Baris ketiga itu yang paling berharga: **pratinjau terhitung**. User lihat
akibat nyatanya sebelum nyimpan, bukan nemuin kejutan tiga hari kemudian.
Ini juga alasan kenapa pendekatan ekspansi menang — pratinjau kayak gini
gampang dibikin karena ekspansinya cuma teks.

Aturan tambahan:

| Situasi | Tambahan |
|---|---|
| Ekspansi ngandung waktu | Tampilin tanggal/jam terhitung (§7.1) |
| Ekspansi ngandung verba merusak | Peringatan tegas + ketik ulang "ya" (§16) |
| Nimpa entri lama | Tampilin arti lama vs baru berdampingan |
| Nimpa kata bawaan | Peringatan contoh kalimat (§10.1) |

Hapus entri juga konfirmasi, dan kalau [V3] jadi: "'clientan' kepake 14 kali
bulan ini. Hapus?"

---

## §13 UX / UI

### 13.1 Chat aja cukup? Enggak.

Chat cukup buat **bikin**, tapi jelek buat **ngelola**. Ngeliat 30 entri lewat
gelembung chat itu nyiksa. Rekomendasi: **dua-duanya, dengan pembagian tugas
yang jelas.**

| Lewat chat | Lewat Setelan |
|---|---|
| Ngajarin (jalur ① dan ②) | Ngeliat semua |
| Hapus satu ("hapus vocabulary clientan") | Edit di tempat |
| Lihat sekilas (dibatasi 10 + "lihat semua") | Hapus banyak, reset total |

### 13.2 Setelan → Kamus Saya

```
Kamus Saya                                    [ + Tambah ]

  clientan          → meeting client          alias    ⋯
  beresin           → selesaiin               aksi     ⋯   ⚠ nimpa kata bawaan
  urusan kampus     → jadwal kuliah           filter   ⋯

  23 dari 200 entri            [ Reset semua ]
```

- Ketuk baris → edit di tempat (`dari` gak bisa diubah; ganti frasa = hapus lalu bikin — bikin niatnya jelas)
- `⚠` buat entri yang nimpa kata bawaan
- "Reset semua" minta ngetik ulang kata konfirmasi, bukan cuma "ya"

### 13.3 Perlihatkan pas kepake

Pas kamus kepake, **tunjukin**:

```
Jadwal kamu besok: Meeting Client A
(dari kamus kamu: clientan → meeting client)
```

Baris kedua kecil dan redup. Fungsinya penting: pas hasilnya salah, user
langsung tau **kenapa** dan bisa benerin kamusnya — bukan nyalahin app-nya.
Preview chip yang udah ada (`QuickAddPreview`) bisa nyorot frasa kamus dengan
warna beda.

---

## §14 Extensibility

Karena "tipe" bukan cabang parser (§4.1), nambah tipe baru **gak nyentuh
parser** sama sekali. Tipe cuma bundel dari: label, ikon, dan aturan validasi
saat diajarin.

```ts
interface VocabType {
  id: string;                       // 'alias' | 'aksi' | 'filter' | …
  label: string;
  validate(expansion: ParseResult): ValidationResult;
  describe(entry: VocabEntry): string;   // buat pratinjau §12
}
```

Nambah `CUSTOM_CATEGORY` atau `CUSTOM_SHORTCUT` = nambah satu objek ke registri
+ satu nilai ke `check` constraint. Pipeline resolusi (§5.2) gak berubah.

Ini konsekuensi langsung dari pilihan arsitektur: **satu mekanisme, banyak
label** jauh lebih gampang dikembangin daripada **banyak mekanisme**.

---

## §15 Contoh percakapan

**A. Reaktif → ngajarin → langsung kepake**

```
User:   besok gw ada clientan gak?
Sistem: Gue belum ngerti "clientan", jadi belum nemu apa-apa buat besok.
        Mau kasih tau artinya?  [ ajarin "clientan" ]  [ gak usah ]
User:   [ketuk] semua meeting sama client
Sistem: Simpan ini?
          clientan → meeting client
          Contoh: "besok ada clientan gak?"
                → lihat jadwal besok yang judulnya mengandung "meeting client"
        (ya / batal)
User:   ya
Sistem: Sip. Mulai sekarang "clientan" = meeting client.
        Btw, besok kamu ada 1: 15:00 — Meeting Client A.
```

Baris terakhir penting: **langsung jalanin ulang perintah aslinya.** User
nanya sesuatu, dan dia harus dapet jawabannya — bukan cuma notifikasi sukses.

**B. Aksi, nimpa kata bawaan**

```
User:   kalau gw bilang beresin, maksudnya tandain selesai
Sistem: Catatan: "beresin" sekarang gue baca sebagai kata benda,
        jadi "beresin meja" = bikin task "beresin meja".
        Kalau diajarin, kalimat itu jadi perintah nyelesaiin task. Lanjut?
User:   ya
Sistem: Oke. "beresin" = selesaiin.
User:   beresin laporan
Sistem: "Bikin laporan" ditandai selesai.
```

**C. Filter + rentang waktu, tanpa kode tambahan**

```
User:   tampilin semua urusan kampus minggu ini
Sistem: Minggu ini ada 3 jadwal kuliah:
        • Sen 08:00 — Kelas Statistika
        • Rab 13:00 — Praktikum Basis Data
        • Jum 10:00 — Responsi Kalkulus
        (dari kamus kamu: urusan kampus → jadwal kuliah)
```

`urusan kampus` (2 kata) → `jadwal kuliah` → grup topik `kuliah`, digabung sama
rentang "minggu ini". **Nol logika tambahan** — semuanya efek samping ekspansi.

**D. Ditolak karena reserved**

```
User:   kalau gw bilang hapus, maksudnya buka kalender
Sistem: "hapus" itu perintah bawaan, gak bisa dipakai buat kamus —
        nanti kamu gak bisa hapus apa-apa lagi.
        Coba kata lain, misal "buangin".
```

**E. Judul tetap kata sendiri [V2]**

```
User:   tambahin task clientan besok
Sistem: Oke — "clientan", besok.
```

Judulnya tetap "clientan", bukan "meeting client". Kata user, bukan kata sistem.

**F. Ngelola**

```
User:   tampilin vocabulary gw
Sistem: Kamus kamu (3):
          clientan       → meeting client
          beresin        → selesaiin
          urusan kampus  → jadwal kuliah
        Kelola semua di Setelan → Kamus Saya.
User:   hapus vocabulary clientan
Sistem: Hapus "clientan → meeting client"? (ya / batal)
User:   ya
Sistem: Kehapus.
```

---

## §16 Keamanan

### 16.1 Evaluasi usulan lo

> *"custom vocabulary hanya boleh memetakan ke action yang sudah tersedia dan
> tidak boleh membuat arbitrary executable command"*

**Setuju sepenuhnya, dan arsitektur ekspansi ngasih ini gratis.** Kamus cuma
menghasilkan **teks**, dan teks itu lewat parser, validasi, dan konfirmasi yang
**sama persis** dengan ketikan manusia. Gak ada jalur eksekusi kedua. Gak ada
sesuatu yang bisa "dijalankan" — cuma frasa yang bisa dibaca.

Ini properti keamanan terkuat dari desain ini: **permukaan serangannya nol
karena gak ada mesin baru yang dibikin.**

### 16.2 Kasus "nuke" → "hapus semua task"

Boleh gak dibikin? **Boleh** — dan tetap aman, karena:

1. Ekspansinya tetap kena konfirmasi hapus massal (`PLAN-CHAT.md` §9).
2. Konfirmasi nampilin **daftar item yang kena**, bukan cuma jumlah.
3. Konfirmasi nampilin **asal-usulnya**: *"(dari kamus kamu: nuke → hapus semua task)"*.

Tapi tetap kasih rem tambahan saat diajarin:

```
Sistem: ⚠ "nuke" bakal jadi perintah yang menghapus data.
        Tiap dipakai, gue tetap minta konfirmasi dulu.
        Yakin mau simpan? Ketik "simpan" buat lanjut.
```

### 16.3 Batas lain

| Risiko | Pengaman |
|---|---|
| Kamus dipakai buat nyulik alur keluar | Meta percakapan reserved (§6.4) |
| Ledakan ekspansi | Sekali jalan, gak rekursif (§5.3) |
| Frasa/arti kepanjangan | Frasa maks 4 kata, arti maks 6 kata |
| Jumlah entri kebanyakan | Maks 200 [V4] |
| Kamus bocor antar user | RLS `auth.uid() = user_id` — udah ada di migrasi |
| Isi kamus kebaca sistem lain | Gak pernah keluar device kecuali ke baris DB milik user sendiri |

### 16.4 Privasi

Kamus pribadi itu **data pribadi** — isinya nama klien, istilah kampus,
kebiasaan. Aturannya: masuk ke `user_lexicon` milik user, dilindungi RLS,
**gak pernah** dikirim ke pihak ketiga mana pun. Karena gak ada AI, gak ada
tujuan lain buat data ini ngalir keluar — konsekuensi yang menyenangkan dari
keputusan §11.2.

---

## §17 Scope MVP

- [ ] Perluasan skema `user_lexicon` (§8.2) + ikut sync multi-entitas
- [ ] Muat kamus ke memori saat boot; **isi hook `ParseOptions.userLexicon` yang selama ini nganggur**
- [ ] Resolusi frasa multi-kata, terpanjang-dulu, sekali jalan (§5.2 tahap ③)
- [ ] Daftar reserved + penjagaan (§6.3)
- [ ] Ngajarin lewat chat: pola langsung + mode dipandu (§3)
- [ ] Konfirmasi dengan **pratinjau terhitung** (§12)
- [ ] Peringatan nimpa kata bawaan (§10.1)
- [ ] Tawaran ngajarin setelah hasil nol (§11.1) — syaratnya sempit
- [ ] `LIST_VOCAB` + hapus lewat chat
- [ ] Setelan → Kamus Saya (daftar, edit, hapus, reset)
- [ ] Tampilkan asal-usul saat kamus kepake (§13.3)
- [ ] Perbaiki `knownWordsCache` yang basi (§11.4)

Tiga tipe (`alias` / `aksi` / `filter`) semuanya masuk MVP — **karena
mekanismenya sama**, biayanya cuma label dan validasi, bukan tiga jalur parser.

---

## §18 Fase 2

| Fitur | Kenapa nanti |
|---|---|
| Hitung pemakaian + peringatan hapus [V3] | Butuh keputusan penyimpanan (jangan disync) |
| Usulan dari kegagalan berulang | "Kata 'clientan' udah 5 kali gak kebaca, mau diajarin?" — ini **ngitung, bukan belajar**. Tetap deterministik. Butuh log lokal §6.1.7 |
| Tipe `shortcut` (ekspansi ke perintah CREATE utuh) | Berguna, tapi butuh peringatan lebih matang |
| Ekspor / impor kamus | Berguna pas ganti HP |
| Layar "Kata yang belum dikenali" (§6.1.7 penuh) | Jalur masuk ketiga; MVP udah ketutup jalur reaktif |
| Saran kamus dari pola pemakaian | Harus tetap **ngitung**, jangan pernah nyimpulin |

---

## §19 Yang sebaiknya TIDAK dibuat

| Jangan | Alasan |
|---|---|
| **Satu frasa banyak arti tergantung konteks** | Ngebunuh determinisme — inti nilai jual sistem ini. Kalau butuh dua arti, bikin dua frasa |
| **Ekspansi rekursif / makro bertingkat** | Siklus, hasil gak ketebak, susah dijelasin (§5.3) |
| **Parameter / wildcard** (`clientan {n} minggu`) | Ini bikin bahasa pemrograman mini. Ledakan kompleksitas + permukaan keamanan |
| **Regex bikinan user** | Sama seperti di atas, plus risiko ReDoS |
| **Kamus dipakai bareng antar user** | Data pribadi; masalah privasi & moderasi gak sepadan |
| **Sistem "nemuin" arti sendiri** | Itu AI dengan nama lain. Melanggar §11.2 dan brief ini |
| **Kamus nimpa kata waktu inti** | Salah waktu = kegagalan senyap paling mahal (§7.1) |
| **Kamus nimpa kata meta percakapan** | Bisa ngunci user di dalam percakapan (§6.4) |
| **Belajar diam-diam dari koreksi** | Semua perubahan kamus harus eksplisit dan terlihat |

---

## §20 Arsitektur final yang disarankan

```
                      ┌──────────────────────────┐
 ketikan user ───────►│ ① normalisasi bentuk     │
                      └────────────┬─────────────┘
                                   ▼
                      ┌──────────────────────────┐
                      │ ② penjagaan reserved     │  reserved ditandai kebal
                      └────────────┬─────────────┘
                                   ▼
                      ┌──────────────────────────┐      ┌──────────────────┐
                      │ ③ resolusi kamus user    │◄─────┤ kamus di memori  │
                      │   terpanjang-dulu        │      │ (≤200, dari store)│
                      │   SEKALI JALAN           │      └──────────────────┘
                      └────────────┬─────────────┘
                                   ▼
                      ┌──────────────────────────┐
                      │ ④ slang bawaan           │
                      └────────────┬─────────────┘
                                   ▼
              ╔════════════════════════════════════════╗
              ║  PIPELINE YANG UDAH ADA — NOL PERUBAHAN ║
              ║  intent → entitas → validasi → aksi     ║
              ╚════════════════════┬═══════════════════╝
                                   ▼
                      ┌──────────────────────────┐
                      │ balasan + asal-usul      │
                      └──────────────────────────┘
```

Empat properti yang bikin arsitektur ini layak dibangun:

| Properti | Diperoleh dari |
|---|---|
| **Deterministik** | Ekspansi teks sekali jalan, terpanjang-dulu. Gak ada skor, gak ada ambang, gak ada tebakan |
| **Bisa dijelaskan** | Tiap ekspansi bisa ditampilin sebagai satu baris ke user |
| **Aman** | Kamus menghasilkan teks, bukan perintah. Gak ada jalur eksekusi kedua (§16.1) |
| **Murah dikembangin** | Tipe baru = satu entri registri. Parser gak pernah disentuh lagi (§14) |

**Prinsip yang gue saranin dicatat di log keputusan:**

> Kamus pribadi itu **makro teks**, bukan mesin aturan.
> Dia jalan sebelum parser dan gak pernah ngajarin parser hal baru —
> dia cuma nulis ulang kalimat user jadi kalimat yang parser udah ngerti.

Itu yang bikin fitur ini bisa dikirim tanpa nambah risiko ke bagian sistem yang
udah jalan.

---

## §21 Log keputusan (usulan, nunggu disetujui)

| Tanggal | Keputusan | Alasan |
|---|---|---|
| 2026-08-09 | Kamus = ekspansi teks, bukan mapping terstruktur | Nol jalur parser baru; komposisi & pratinjau gratis (§4.1) |
| 2026-08-09 | Pakai ulang tabel `user_lexicon`, jangan bikin baru | Udah ada + RLS; tabel kedua = dua sumber kebenaran (§8.1) |
| 2026-08-09 | Ekspansi sekali jalan, gak rekursif | Siklus mustahil secara konstruksi (§5.3) |
| 2026-08-09 | Reserved gak bisa ditimpa; sisanya boleh dengan peringatan | Nyeimbangin keamanan lawan kegunaan (§6.2) |
| 2026-08-09 | Meta percakapan masuk reserved | Kamus gak boleh ngunci user di percakapannya (§6.4) |
| 2026-08-09 | Judul CREATE pakai kata asli user | `display` vs `norm` udah nyediain ini (§5.4) |
| 2026-08-09 | Tawaran ngajarin cuma pas non-CREATE **dan** hasil nol | Nyegah fitur ini jadi gangguan (§11.1) |
| 2026-08-09 | Konfirmasi wajib bawa pratinjau terhitung | Akibatnya kelihatan sebelum disimpan (§12) |
| 2026-08-09 | Satu frasa = satu arti, selamanya | Konteks-sensitif ngebunuh determinisme (§19) |
| 2026-08-09 | Kamus bawaan tetap di JSON, bukan DB | Offline, ikut versi app, nol query saat boot (§8.2) |
