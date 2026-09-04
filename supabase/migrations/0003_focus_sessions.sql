-- HaKaiTask — bikin `focus_sessions` siap disinkronkan
-- Rujukan: PLAN.md §6.3 (Focus Mode + Pomodoro)
--
-- Tabelnya udah ada sejak 0001, lengkap sama RLS — tapi klien-nya belum pernah
-- nyentuh, dan waktu mau disentuh ternyata kurang tiga hal. Persis kejadian
-- yang sama kayak `busy_blocks` di 0002:
--
--   1. Gak ada `updated_at`. Pull inkremental bentuknya selalu
--      "updated_at > since" per user — tanpa kolom ini, tarikan PERTAMA
--      langsung error, bukan cuma kosong.
--   2. Gak ada `deleted_at`. Hapus di satu device harus tombstone, kalau
--      enggak barisnya "hidup lagi" dari cache device lain.
--   3. Gak masuk publication realtime.
--
-- Plus satu ketidakcocokan: §6.3 punya TIGA mode (pomodoro / deep work /
-- stopwatch), tapi constraint di 0001 cuma kenal dua.

-- ── siap disinkronkan ───────────────────────────────────────────────────────
alter table focus_sessions
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

-- Pull inkremental selalu berbentuk "updated_at > since" per user.
create index if not exists focus_user_updated on focus_sessions (user_id, updated_at);

drop trigger if exists focus_sessions_touch on focus_sessions;
create trigger focus_sessions_touch
  before update on focus_sessions
  for each row execute function touch_updated_at();

-- ── tiga mode, bukan dua ────────────────────────────────────────────────────
alter table focus_sessions drop constraint if exists focus_sessions_mode_check;
alter table focus_sessions add constraint focus_sessions_mode_check
  check (mode in ('pomodoro', 'deep', 'stopwatch'));

-- ── realtime ────────────────────────────────────────────────────────────────
-- 0001 masukin tasks/busy_blocks/projects, 0002 masukin user_lexicon.
-- `add table` error kalau tabelnya udah ada di publication, jadi dijaga dulu.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'focus_sessions'
  ) then
    alter publication supabase_realtime add table focus_sessions;
  end if;
end $$;
