-- HaKaiTask — skema awal (PLAN.md §3.2)
-- Semua tabel pakai RLS dengan policy auth.uid() = user_id.
-- Tidak ada rahasia sisi server, jadi tidak butuh service role key.

-- ── projects ────────────────────────────────────────────────────────────────
create table projects (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  archived boolean not null default false,
  "order" integer not null default 0
);

create index projects_user on projects (user_id) where archived = false;

-- ── tasks ───────────────────────────────────────────────────────────────────
create table tasks (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  notes text,
  status text not null default 'todo' check (status in ('todo','doing','done','archived')),
  priority smallint not null default 3 check (priority between 1 and 4),
  due_at timestamptz,
  start_at timestamptz,
  all_day boolean not null default false,
  estimate_min integer,
  actual_min integer,
  energy text check (energy in ('low','medium','high')),
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
  snoozed_until timestamptz,
  -- tombstone: hapus di HP tidak boleh "hidup lagi" dari cache web (§6.8)
  deleted_at timestamptz
);

create index tasks_user_due  on tasks (user_id, due_at) where status <> 'archived';
create index tasks_user_stat on tasks (user_id, status);

-- ── busy_blocks ─────────────────────────────────────────────────────────────
-- Jadwal tetap yang bukan task. Fungsinya cuma menutup slot waktu (§6.2).
create table busy_blocks (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  recurrence text,
  check (end_at > start_at)
);

create index busy_user_time on busy_blocks (user_id, start_at);

-- ── focus_sessions ──────────────────────────────────────────────────────────
create table focus_sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid references tasks(id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz,
  minutes integer,
  interruptions integer not null default 0,
  mode text not null default 'pomodoro' check (mode in ('pomodoro','stopwatch'))
);

create index focus_user_time on focus_sessions (user_id, started_at desc);

-- ── user_settings ───────────────────────────────────────────────────────────
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

-- ── user_lexicon ────────────────────────────────────────────────────────────
-- Kamus pribadi hasil "Ajarin" dari user (§6.1.7).
create table user_lexicon (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  dari text not null,
  ke text not null,
  tipe text not null check (tipe in ('slang','niat','partikel','buang')),
  created_at timestamptz not null default now(),
  unique (user_id, dari)
);

-- ── weekly_reviews ──────────────────────────────────────────────────────────
create table weekly_reviews (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  completed_count integer not null default 0,
  focus_minutes integer not null default 0,
  slipped_task_ids uuid[] not null default '{}',
  next_week_focus uuid[] not null default '{}',
  note text,
  created_at timestamptz not null default now(),
  unique (user_id, week_start)
);

-- ── Row Level Security ──────────────────────────────────────────────────────
alter table projects       enable row level security;
alter table tasks          enable row level security;
alter table busy_blocks    enable row level security;
alter table focus_sessions enable row level security;
alter table user_settings  enable row level security;
alter table user_lexicon   enable row level security;
alter table weekly_reviews enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'projects','tasks','busy_blocks','focus_sessions',
    'user_settings','user_lexicon','weekly_reviews'
  ]
  loop
    execute format(
      'create policy %I on %I for all to authenticated
         using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      t || '_owner', t
    );
  end loop;
end $$;

-- ── updated_at otomatis ─────────────────────────────────────────────────────
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger tasks_touch
  before update on tasks
  for each row execute function touch_updated_at();

-- ── Realtime ────────────────────────────────────────────────────────────────
alter publication supabase_realtime add table tasks;
alter publication supabase_realtime add table busy_blocks;
alter publication supabase_realtime add table projects;
