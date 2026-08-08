-- HaKaiTask — dukungan chat & kamus pribadi
-- Rujukan: PLAN-CHAT.md (keputusan P1, T6/T7) dan PLAN-VOCAB.md §8.2
--
-- Dua hal yang dibenerin di sini:
--   1. `busy_blocks` belum punya kolom yang dibutuhin sync (updated_at buat
--      pull inkremental, deleted_at buat tombstone). Tabelnya udah ada sejak
--      awal, cuma klien-nya yang gak pernah nyentuh — sekarang dipakai.
--   2. `user_lexicon` bentuknya masih "1 kata → 1 kata" buat koreksi slang.
--      Kamus pribadi butuh frasa → makna, plus tombstone biar hapus di satu
--      device gak "hidup lagi" dari device lain.

-- ── busy_blocks: siap disinkronkan ──────────────────────────────────────────
alter table busy_blocks
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

create trigger busy_blocks_touch
  before update on busy_blocks
  for each row execute function touch_updated_at();

-- Pull inkremental selalu berbentuk "updated_at > since" per user.
create index if not exists busy_user_updated on busy_blocks (user_id, updated_at);

-- ── user_lexicon: frasa → makna ─────────────────────────────────────────────
alter table user_lexicon
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

alter table user_lexicon drop constraint if exists user_lexicon_tipe_check;
alter table user_lexicon add constraint user_lexicon_tipe_check
  check (tipe in ('alias', 'aksi', 'filter', 'slang', 'buang'));

-- Unique lama nabrak soft delete: entri yang udah dihapus mestinya gak nahan
-- frasanya. Diganti unique parsial yang cuma berlaku buat entri hidup.
alter table user_lexicon drop constraint if exists user_lexicon_user_id_dari_key;
create unique index if not exists user_lexicon_aktif
  on user_lexicon (user_id, dari) where deleted_at is null;

create index if not exists lexicon_user_updated on user_lexicon (user_id, updated_at);

create trigger user_lexicon_touch
  before update on user_lexicon
  for each row execute function touch_updated_at();

-- ── Realtime ────────────────────────────────────────────────────────────────
-- busy_blocks udah masuk publication di 0001; user_lexicon belum.
alter publication supabase_realtime add table user_lexicon;
