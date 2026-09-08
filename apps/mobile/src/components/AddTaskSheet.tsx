/**
 * Form nambah task — panel bawah, dipakai dari dashboard & kalender.
 *
 * Ini SENGAJA nyalahin keputusan lama yang ditulis di `apps/web/src/App.tsx`
 * dan `app/(tabs)/calendar.tsx`: chat sebagai satu-satunya pintu masuk, dan
 * kolom quick-add di tiap halaman dibuang. Alasan aslinya masih bener — dua
 * pintu masuk yang sama-sama lengkap bikin orang bingung mesti lewat mana,
 * dan parser yang gak pernah dipakai bakal pelan-pelan lapuk.
 *
 * Yang beda: form ini bukan pintu masuk KEDUA yang setara, dia jalur buat
 * momen yang beda. Chat menang kalau kalimatnya udah kebayang ("besok jam 5"
 * itu empat kata). Form menang kalau yang mau diatur bukan kalimat — prioritas,
 * jadwal pengingat, subtask — atau pas lagi males nyusun kalimat sama sekali.
 * Parser tetap jalur utama dan tetap yang dites paling dalam.
 *
 * Field-nya dibatesin ke yang beneran dipakai orang pas NAMBAH. Sisanya —
 * subtask, tag, catatan panjang — diurus di layar task sesudah dibikin,
 * karena form nambah yang minta lima belas isian bakal ditinggal di isian
 * ketiga.
 */
import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import type { Energy, Priority, TaskReminders } from "@hakaitask/core";
import { createTask } from "@hakaitask/app/tasks";
import { useTheme } from "../theme";
import { Chip } from "../ui/Chip";
import { DateTimeField } from "../ui/DateTimeField";
import { Field } from "../ui/Field";
import { Input } from "../ui/Input";
import { Pill } from "../ui/Pill";
import { Sheet } from "../ui/Sheet";
import { Switch } from "../ui/Switch";
import { T } from "../ui/T";
import { ReminderField } from "./ReminderField";

const PRIORITAS: { p: Priority; label: string }[] = [
  { p: 1, label: "P1" },
  { p: 2, label: "P2" },
  { p: 3, label: "P3" },
  { p: 4, label: "P4" },
];

const ENERGI: { e: Energy; label: string }[] = [
  { e: "low", label: "Santai" },
  { e: "medium", label: "Sedang" },
  { e: "high", label: "Berat" },
];

export function AddTaskSheet({
  open,
  onClose,
  userId,
  /** Diisi kalender: tanggal yang barusan diketuk. */
  prefillDate,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  userId: string;
  prefillDate?: Date | null;
  onCreated?: (id: string) => void;
}) {
  const th = useTheme();

  const [title, setTitle] = useState("");
  const [due, setDue] = useState<Date | null>(null);
  const [allDay, setAllDay] = useState(false);
  const [priority, setPriority] = useState<Priority>(3);
  const [energy, setEnergy] = useState<Energy | null>(null);
  const [estimate, setEstimate] = useState("");
  const [reminders, setReminders] = useState<TaskReminders | undefined>(undefined);

  /**
   * Dibalikin ke kosong tiap panelnya DIBUKA, bukan tiap ditutup.
   *
   * Kalau dibersihin pas nutup, isian sempat kelihatan kosong beberapa frame
   * selama animasi turun — kayak formnya kehapus di depan mata. Dibersihin
   * pas buka, yang kelihatan cuma form baru.
   */
  useEffect(() => {
    if (!open) return;
    setTitle("");
    setDue(prefillDate ?? null);
    setAllDay(false);
    setPriority(3);
    setEnergy(null);
    setEstimate("");
    setReminders(undefined);
  }, [open, prefillDate]);

  const bisaSimpan = title.trim().length > 0;

  const simpan = () => {
    if (!bisaSimpan) return;
    const menit = Number(estimate.replace(/[^0-9]/g, ""));
    const id = createTask(
      {
        title,
        priority,
        allDay,
        ...(due ? { dueAt: due.toISOString() } : {}),
        ...(energy ? { energy } : {}),
        ...(Number.isFinite(menit) && menit > 0 ? { estimateMin: menit } : {}),
        ...(reminders ? { reminders } : {}),
      },
      userId,
    );
    onClose();
    onCreated?.(id);
  };

  return (
    <Sheet open={open} onClose={onClose}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ gap: th.space[4], paddingBottom: th.space[3] }}
      >
        <T variant="h1" style={{ fontSize: 22 }}>
          Task baru
        </T>

        <Input
          variant="h2"
          style={{ fontSize: 20, lineHeight: 28 }}
          value={title}
          onChangeText={setTitle}
          placeholder="Mau ngerjain apa?"
          autoFocus
          multiline
        />

        <Field label="Kapan">
          <DateTimeField value={due} onChange={setDue} />
        </Field>

        {due ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: th.space[2] }}>
            <View style={{ flex: 1 }}>
              <T variant="body">Seharian</T>
              <T variant="meta" tone="ink40">
                Tanpa jam khusus.
              </T>
            </View>
            <Switch value={allDay} onChange={setAllDay} />
          </View>
        ) : null}

        <Field label="Prioritas">
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {PRIORITAS.map((x) => (
              <Chip
                key={x.p}
                label={x.label}
                active={priority === x.p}
                onPress={() => setPriority(x.p)}
              />
            ))}
          </View>
        </Field>

        <Field label="Tenaga yang dibutuhin" hint="Dipakai buat milih task yang pas sama jamnya.">
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {ENERGI.map((x) => (
              <Chip
                key={x.e}
                label={x.label}
                active={energy === x.e}
                onPress={() => setEnergy(energy === x.e ? null : x.e)}
              />
            ))}
          </View>
        </Field>

        <Field label="Perkiraan waktu" hint="Menit. Boleh dikosongin.">
          <Input
            tone="filled"
            value={estimate}
            onChangeText={setEstimate}
            placeholder="45"
            keyboardType="number-pad"
          />
        </Field>

        {/* Pengingat cuma masuk akal kalau ada tenggatnya. */}
        {due ? (
          <Field label="Pengingat">
            <ReminderField value={reminders} onChange={setReminders} />
          </Field>
        ) : null}

        <View style={{ flexDirection: "row", gap: 10, marginTop: th.space[2] }}>
          <Pill label="Batal" tone="soft" onPress={onClose} style={{ flex: 1 }} />
          <Pill label="Simpan" onPress={simpan} disabled={!bisaSimpan} style={{ flex: 1 }} />
        </View>
      </ScrollView>
    </Sheet>
  );
}
