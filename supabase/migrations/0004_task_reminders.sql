-- HaKaiTask — jadwal pengingat per task
-- Rujukan: PLAN.md §6.7 (kebijakan notifikasi)
--
-- Sampai sekarang pengingat itu TUNGGAL: `reminder_min`, satu angka menit
-- sebelum tenggat. Dua permintaan yang gak bisa dilayani bentuk itu:
--
--   1. Pengingat awal — "ingetin seminggu sebelum tenggat", biasanya barengan
--      sama pengingat lain yang lebih deket.
--   2. Pengingat berulang — "ingetin tiap hari selama seminggu terakhir".
--
-- Dua-duanya butuh HIMPUNAN, bukan satu angka. Bentuknya jsonb, bukan
-- kolom-kolom terpisah atau int[]:
--
--   {"leads": [10080, 1440, 60],
--    "repeat": {"startMin": 10080, "everyMin": 1440}}
--
-- `leads` array menit sebelum tenggat. `repeat` deret berjendela: mulai
-- `startMin` sebelum tenggat, tiap `everyMin`, berhenti PAS tenggat. Sengaja
-- berjendela dan bukan "tiap N dari sekarang" — jumlah alarmnya bisa dihitung
-- (`startMin / everyMin`) SEBELUM dijadwalin, jadi gak ada bentuk input yang
-- diam-diam bikin ribuan alarm. Klien masih motong lagi di 64 per task.

-- ── kolom ───────────────────────────────────────────────────────────────────
alter table tasks
  add column if not exists reminders jsonb;

-- `reminder_min` SENGAJA dibiarkan hidup, bukan dimigrasi lalu dibuang:
--
--   * parser masih nulis ke sana ("ingetin 30 menit sebelumnya") dan itu jalur
--     yang beda dari form;
--   * baris lama gak perlu disentuh sama sekali — klien baca `reminders`
--     duluan dan jatuh ke `reminder_min` kalau kosong, jadi backfill-nya gak
--     perlu ada;
--   * klien lama yang belum tau `reminders` tetap bisa jalan tanpa error.
--
-- Yang tau urutan menangnya cuma satu tempat: `resolveLeads()` di core.

comment on column tasks.reminders is
  'Jadwal pengingat opsional: {"leads":[menit,...],"repeat":{"startMin":n,"everyMin":n}}. Kosong = pakai reminder_min, lalu bawaan setelan.';

-- ── jaga bentuknya ──────────────────────────────────────────────────────────
-- Bukan validasi lengkap — cuma nahan yang bakal bikin klien bingung: nilai
-- non-obyek, dan `everyMin` <= 0 yang di sisi klien artinya deret tak
-- berujung. Sisanya (angka masuk akal, panjang array) diurus di form.
alter table tasks
  drop constraint if exists tasks_reminders_shape;

alter table tasks
  add constraint tasks_reminders_shape check (
    reminders is null
    or (
      jsonb_typeof(reminders) = 'object'
      and (
        not (reminders ? 'leads')
        or jsonb_typeof(reminders -> 'leads') = 'array'
      )
      and (
        not (reminders ? 'repeat')
        or (
          jsonb_typeof(reminders -> 'repeat') = 'object'
          and (reminders -> 'repeat' ->> 'everyMin')::numeric > 0
          and (reminders -> 'repeat' ->> 'startMin')::numeric > 0
        )
      )
    )
  );

-- Sengaja GAK bikin index. `reminders` gak pernah jadi predikat: penjadwalan
-- narik task punya user lalu ngitung di klien. Index di sini cuma nambah
-- ongkos tulis buat query yang gak pernah ada.
