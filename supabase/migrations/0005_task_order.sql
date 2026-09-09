-- HaKaiTask — urutan manual kartu di papan kanban
-- Rujukan: fase 7 roadmap
--
-- Kolomnya PECAHAN, bukan indeks bulat, dan itu keputusan sinkronisasi, bukan
-- selera.
--
-- Dengan indeks bulat, mindahin satu kartu ke tengah berarti nomorin ulang
-- semua kartu di bawahnya. Sinkronisasi di app ini LWW per baris, jadi dua HP
-- yang nomorin ulang kolom yang sama bakal saling nimpa — dan hasilnya bukan
-- "salah satu menang", tapi urutan acak di DUA-DUANYA, karena tiap baris
-- dimenangin oleh perangkat yang beda.
--
-- Dengan pecahan, satu geseran = SATU baris berubah: nilainya diambil di
-- tengah-tengah dua tetangganya. Kartu yang gak disentuh gak ikut ditulis,
-- jadi gak ada yang bisa bentrok.
--
-- `double precision`, bukan `numeric`: klien ngitungnya pakai `number` (float
-- 64-bit) dan udah punya penjagaan sendiri waktu celahnya kehabisan
-- ketelitian (`rankBetween` → "renumber"). Pakai `numeric` di server bikin
-- ketelitian dua sisi beda, dan bedanya baru kelihatan waktu satu kartu
-- "pindah" ke tempat yang sama persis.

-- ── kolom ───────────────────────────────────────────────────────────────────
--
-- NAMANYA `sort_order`, bukan `order`. `order` itu kata kunci SQL: sebagai
-- nama kolom dia harus dikutip di tiap query yang nyentuh dia, dan sekali ada
-- yang lupa, errornya muncul sebagai kesalahan sintaks yang gak nyebut-nyebut
-- kolomnya. Di sisi klien namanya tetap `order`; `packages/app/src/mapping.ts`
-- yang jembatanin, dan itu emang tugasnya.
alter table tasks
  add column if not exists sort_order double precision;

comment on column tasks.sort_order is
  'Urutan manual dalam kolom kanban. Pecahan: geser = satu baris berubah. NULL = belum pernah diurutin tangan, pakai urutan bawaan (prioritas, lalu tenggat).';

-- NULL itu nilai yang berarti, bukan data yang belum lengkap: dia bilang
-- "kartu ini belum pernah disentuh tangan". Jadi TANPA default dan TANPA
-- backfill — ngisi semuanya dengan angka justru ngapus bedanya.

-- ── index ───────────────────────────────────────────────────────────────────
-- Papan selalu diambil per user lalu diurut per kolom. Index ini yang bikin
-- urutannya gak perlu disortir ulang di memori tiap kali papannya dibuka.
--
-- `nulls last` disamain sama sisi klien: kartu yang udah diurutin tangan
-- selalu di ATAS yang belum.
create index if not exists tasks_board_order
  on tasks (user_id, status, sort_order nulls last)
  where deleted_at is null;
