/**
 * Jadwal pengingat per task — dipakai bareng form nambah task & layar task.
 *
 * ANGKA "≈ N pengingat" di bawah itu bukan hiasan, dan bukan tempelan yang
 * boleh dilepas kalau layarnya kepenuhan.
 *
 * Pengingat yang disetel tangan sengaja NEMBUS batas harian
 * (`maxNotifPerDay`) — keputusan yang diambil di fase 1B, dengan alasan kalau
 * user niat nyetel "tiap 2 jam" terus diem-diem cuma dikasih 4, yang rusak
 * bukan cuma fiturnya tapi kepercayaan bahwa setelan di app ini ngaruh. Tapi
 * begitu batasnya dilepas, gak ada lagi yang berdiri antara user dan tiga
 * ratus notifikasi. Angka ini yang gantiin batas itu: dia bikin ongkosnya
 * kelihatan SEBELUM disimpan, bukan sesudah HP-nya bunyi seharian.
 *
 * Makanya angkanya dihitung pakai `resolveLeads()` — fungsi yang SAMA persis
 * yang dipakai penjadwal. Kalau dihitung ulang di sini dengan rumus sendiri,
 * cepat atau lambat dia bakal beda sama kenyataan, dan angka yang bohong
 * lebih buruk daripada gak ada angka.
 */
import { useMemo } from "react";
import { View } from "react-native";
import { DEFAULT_SETTINGS, type Task, type TaskReminders } from "@hakaitask/core";
import { resolveLeads } from "@hakaitask/core/notify";
import { useTheme } from "../theme";
import { Chip } from "../ui/Chip";
import { Switch } from "../ui/Switch";
import { T } from "../ui/T";

const MENIT = 1;
const JAM = 60;
const HARI = 1440;

const LEAD_PILIHAN: { label: string; m: number }[] = [
  { label: "30 menit", m: 30 * MENIT },
  { label: "1 jam", m: 1 * JAM },
  { label: "3 jam", m: 3 * JAM },
  { label: "1 hari", m: 1 * HARI },
  { label: "3 hari", m: 3 * HARI },
  { label: "1 minggu", m: 7 * HARI },
];

const MULAI_PILIHAN: { label: string; m: number }[] = [
  { label: "1 hari", m: 1 * HARI },
  { label: "3 hari", m: 3 * HARI },
  { label: "1 minggu", m: 7 * HARI },
];

const TIAP_PILIHAN: { label: string; m: number }[] = [
  { label: "2 jam", m: 2 * JAM },
  { label: "6 jam", m: 6 * JAM },
  { label: "1 hari", m: 1 * HARI },
];

export function ReminderField({
  value,
  onChange,
}: {
  value: TaskReminders | undefined;
  onChange: (r: TaskReminders | undefined) => void;
}) {
  const th = useTheme();
  const leads = value?.leads ?? [];
  const repeat = value?.repeat;

  /**
   * Dihitung lewat jalur yang sama kayak penjadwal, termasuk batas 64 per
   * task — jadi angka yang kelihatan di sini emang segitu yang bakal bunyi,
   * bukan perkiraan.
   */
  const jumlah = useMemo(() => {
    if (!value) return 0;
    const palsu = { reminders: value } as Task;
    return resolveLeads(palsu, { ...DEFAULT_SETTINGS, userId: "x" }).length;
  }, [value]);

  const bersihin = (next: TaskReminders): TaskReminders | undefined => {
    const adaLeads = (next.leads?.length ?? 0) > 0;
    // Semua dimatiin → balik ke `undefined`, bukan objek kosong. Objek kosong
    // kesimpen ke kolom jsonb dan bikin task keliatan punya setelan khusus
    // padahal enggak.
    return adaLeads || next.repeat ? next : undefined;
  };

  const toggleLead = (m: number) => {
    const ada = leads.includes(m);
    const next = ada ? leads.filter((x) => x !== m) : [...leads, m].sort((a, b) => a - b);
    onChange(bersihin({ ...value, leads: next }));
  };

  const setRepeat = (r: TaskReminders["repeat"] | undefined) => {
    const next: TaskReminders = { ...value };
    if (r) next.repeat = r;
    else delete next.repeat;
    onChange(bersihin(next));
  };

  return (
    <View style={{ gap: th.space[2] }}>
      <T variant="meta" tone="ink40">
        Ingetin sebelum tenggat
      </T>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {LEAD_PILIHAN.map((p) => (
          <Chip
            key={p.m}
            label={p.label}
            active={leads.includes(p.m)}
            onPress={() => toggleLead(p.m)}
          />
        ))}
      </View>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: th.space[2],
          marginTop: th.space[2],
        }}
      >
        <View style={{ flex: 1 }}>
          <T variant="body">Ingetin berulang</T>
          <T variant="meta" tone="ink40">
            Bunyi tiap sekian waktu sampai tenggat.
          </T>
        </View>
        <Switch
          value={!!repeat}
          onChange={(on) =>
            setRepeat(on ? { startMin: 1 * HARI, everyMin: 2 * JAM } : undefined)
          }
        />
      </View>

      {repeat ? (
        <>
          <T variant="meta" tone="ink40">
            Mulai
          </T>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {MULAI_PILIHAN.map((p) => (
              <Chip
                key={p.m}
                label={p.label}
                active={repeat.startMin === p.m}
                onPress={() => setRepeat({ ...repeat, startMin: p.m })}
              />
            ))}
          </View>

          <T variant="meta" tone="ink40">
            Tiap
          </T>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {TIAP_PILIHAN.map((p) => (
              <Chip
                key={p.m}
                label={p.label}
                active={repeat.everyMin === p.m}
                onPress={() => setRepeat({ ...repeat, everyMin: p.m })}
              />
            ))}
          </View>
        </>
      ) : null}

      {jumlah > 0 ? (
        <T variant="meta" tone={jumlah > 12 ? "accent" : "ink40"}>
          {`≈ ${jumlah} pengingat buat task ini`}
          {jumlah > 12 ? " — banyak juga." : ""}
        </T>
      ) : null}
    </View>
  );
}
