/**
 * Pilih tanggal & jam — chip dulu, kalender belakangan.
 *
 * Kenapa bukan langsung kalender: task di app ini hampir selalu jatuh di
 * beberapa hari ke depan. Parser-nya sendiri lahir dari kenyataan itu —
 * "besok jam 5" itu empat kata. Kalau form-nya maksa lewat kotak kalender
 * plus jarum jam buat hal yang sama, form-nya jadi lebih lambat daripada
 * ngetik, dan alasan form ini ada (males ngetik) ilang.
 *
 * Jadi chip yang di depan, dan kalender sistemnya nunggu di belakang buat
 * yang gak ketutup chip. Tanggal tiga minggu lagi tetap bisa dimasukin, cuma
 * gak jadi ongkos yang dibayar tiap kali.
 *
 * Jam sengaja MUNCUL BELAKANGAN, cuma sesudah tanggalnya ada: task tanpa
 * tanggal tapi punya jam itu gak berarti apa-apa, dan nampilin dua baris chip
 * sekaligus bikin isian ini keliatan lebih berat daripada aslinya.
 */
import { useState } from "react";
import { View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { sameDay } from "@hakaitask/app";
import { useTheme } from "../theme";
import { Chip } from "./Chip";
import { T } from "./T";

/** Jam bawaan buat task yang tanggalnya dipilih lewat chip. */
const JAM_BAWAAN = 9;
const JAM_CEPAT = [9, 12, 15, 18, 21];

function hari(dari: Date, tambah: number): Date {
  const d = new Date(dari);
  d.setDate(d.getDate() + tambah);
  return d;
}

/** Ganti tanggalnya, JAMNYA dipertahankan — dan sebaliknya buat `setJam`. */
function setTanggal(lama: Date | null, baru: Date): Date {
  const out = new Date(baru);
  if (lama) out.setHours(lama.getHours(), lama.getMinutes(), 0, 0);
  else out.setHours(JAM_BAWAAN, 0, 0, 0);
  return out;
}

function setJam(lama: Date | null, jam: number, menit = 0): Date {
  const out = lama ? new Date(lama) : new Date();
  out.setHours(jam, menit, 0, 0);
  return out;
}

export function DateTimeField({
  value,
  onChange,
  now = new Date(),
}: {
  value: Date | null;
  onChange: (d: Date | null) => void;
  /** Disuntik biar bisa dites & biar chip-nya gak geser tiap render. */
  now?: Date;
}) {
  const th = useTheme();
  const [picking, setPicking] = useState<null | "date" | "time">(null);

  const preset: { label: string; d: Date }[] = [
    { label: "Hari ini", d: hari(now, 0) },
    { label: "Besok", d: hari(now, 1) },
    { label: "Lusa", d: hari(now, 2) },
    { label: "Minggu depan", d: hari(now, 7) },
  ];

  return (
    <View style={{ gap: th.space[2] }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {preset.map((p) => (
          <Chip
            key={p.label}
            label={p.label}
            active={!!value && sameDay(value, p.d)}
            onPress={() => onChange(setTanggal(value, p.d))}
          />
        ))}
        <Chip label="Pilih tanggal…" onPress={() => setPicking("date")} />
        {value ? <Chip label="Hapus" onPress={() => onChange(null)} /> : null}
      </View>

      {value ? (
        <>
          <T variant="meta" tone="ink40">
            Jam
          </T>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {JAM_CEPAT.map((j) => (
              <Chip
                key={j}
                label={`${String(j).padStart(2, "0")}:00`}
                active={value.getHours() === j && value.getMinutes() === 0}
                onPress={() => onChange(setJam(value, j))}
              />
            ))}
            <Chip label="Pilih jam…" onPress={() => setPicking("time")} />
          </View>
        </>
      ) : null}

      {picking ? (
        <DateTimePicker
          value={value ?? setJam(hari(now, 0), JAM_BAWAAN)}
          mode={picking}
          onChange={(e, d) => {
            // Di Android dialognya nutup sendiri — state-nya harus ikut
            // dibersihin di SEMUA cabang, termasuk pas dibatalin. Kalau
            // enggak, dialognya gak bisa dibuka lagi sampai layar di-remount.
            setPicking(null);
            if (e.type !== "set" || !d) return;
            onChange(picking === "date" ? setTanggal(value, d) : setJam(value, d.getHours(), d.getMinutes()));
          }}
        />
      ) : null}
    </View>
  );
}
