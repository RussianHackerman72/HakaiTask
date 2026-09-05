/**
 * Detail task — versi lengkap (§5.1 #2).
 *
 * Ditaruh sebagai ROUTE, bukan komponen lokal, karena dia tujuan deep-link
 * tiap notifikasi nanti (§6.7 aturan 3). Datanya dibaca dari store LEWAT ID —
 * bukan disalin ke state — biar perubahan dari device lain (realtime) tetap
 * kelihatan walau layarnya lagi kebuka.
 */
import { useEffect, useState } from "react";
import { ScrollView, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { Priority } from "@hakaitask/core";
import { useKaiStore } from "@hakaitask/core/store";
import {
  addSubtask,
  archiveTask,
  completeTask,
  deleteTask,
  patchTask,
  snoozeTask,
  startTask,
  toggleSubtask,
  uncompleteTask,
} from "@hakaitask/app/tasks";
import {
  durationLabel,
  isOverdue,
  metaLine,
  snoozeTargets,
  whenLabel,
} from "@hakaitask/app/format";
import { useNow } from "@hakaitask/app";
import { Screen } from "../../src/ui/Screen";
import { T } from "../../src/ui/T";
import { Chip } from "../../src/ui/Chip";
import { Pill } from "../../src/ui/Pill";
import { Tappable } from "../../src/ui/Pressable";
import { Checkbox, Strike } from "../../src/ui/Checkbox";
import { useTheme } from "../../src/theme";

const PRIORITIES: Priority[] = [1, 2, 3, 4];

export default function TaskDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const th = useTheme();
  const now = useNow();
  const task = useKaiStore((s) => (id ? s.tasks[id] : undefined));

  const [title, setTitle] = useState(task?.title ?? "");
  const [notes, setNotes] = useState(task?.notes ?? "");
  const [newSubtask, setNewSubtask] = useState("");

  // Perubahan dari device lain (realtime) harus kelihatan walau layar kebuka.
  useEffect(() => setTitle(task?.title ?? ""), [task?.title]);
  useEffect(() => setNotes(task?.notes ?? ""), [task?.notes]);

  if (!task) {
    return (
      <Screen>
        <View style={{ gap: th.space[3], paddingTop: th.space[4] }}>
          <T variant="h2">Task-nya gak ketemu.</T>
          <T variant="bodySm" tone="ink70">Mungkin udah kehapus dari device lain.</T>
          <Pill label="Kembali" tone="soft" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  const done = task.status === "done";
  const overdue = isOverdue(task, now);
  const meta = metaLine([
    whenLabel(task.dueAt ?? task.startAt, now, task.allDay),
    durationLabel(task.estimateMin),
    task.tags.map((t) => "#" + t).join(" ") || undefined,
  ]);

  const close = () => router.back();

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingVertical: th.space[3], paddingBottom: 48 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: th.space[3] }}>
          <View style={{ paddingTop: 6 }}>
            <Checkbox
              checked={done}
              onChange={() => (done ? uncompleteTask(task) : completeTask(task))}
              label={done ? "Batalkan " + task.title : "Selesaikan " + task.title}
            />
          </View>

          <View style={{ flex: 1 }}>
            <TextInput
              value={title}
              onChangeText={setTitle}
              onBlur={() => {
                const next = title.trim();
                if (next && next !== task.title) patchTask(task.id, { title: next });
                else setTitle(task.title);
              }}
              style={{ ...th.t.h2, fontSize: 24, lineHeight: 32, color: th.c.ink, padding: 0 }}
              multiline
            />
            <Strike done={done} />
          </View>
        </View>

        {meta ? (
          <T
            variant="num"
            tone={overdue ? "accent" : "ink40"}
            style={{ marginTop: 8, paddingLeft: 38 }}
          >
            {overdue ? "Lewat · " + meta : meta}
          </T>
        ) : null}

        <Section label="Fokus">
          <View style={{ flexDirection: "row", alignItems: "center", gap: th.space[2] }}>
            <Pill
              label="Mulai fokus"
              onPress={() => router.push("/focus/" + task.id)}
              style={{ paddingVertical: 10, paddingHorizontal: 20 }}
            />
            {task.actualMin ? (
              <T variant="num" tone="ink40">udah {task.actualMin} menit</T>
            ) : null}
          </View>
        </Section>

        <Section label="Prioritas">
          <View style={{ flexDirection: "row", gap: 8 }}>
            {PRIORITIES.map((p) => (
              <Chip
                key={p}
                label={"P" + p}
                active={task.priority === p}
                onPress={() => patchTask(task.id, { priority: p })}
              />
            ))}
          </View>
        </Section>

        <Section label="Tunda">
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            {snoozeTargets(now).map(({ label, at }) => (
              <Chip
                key={label}
                label={label}
                onPress={() => {
                  snoozeTask(task, at);
                  close();
                }}
              />
            ))}
            {task.rescheduleCount > 0 && (
              <T variant="num" tone="ink40">
                udah digeser {task.rescheduleCount}x
              </T>
            )}
          </View>
        </Section>

        <Section label="Subtask">
          <View style={{ gap: 8 }}>
            {task.subtasks.map((s) => (
              <View
                key={s.id}
                style={{ flexDirection: "row", alignItems: "center", gap: th.space[2] }}
              >
                <Checkbox
                  checked={s.done}
                  onChange={() => toggleSubtask(task, s.id)}
                  label={s.title}
                  size={18}
                />
                <View style={{ flex: 1 }}>
                  <T variant="bodySm" tone="ink70">{s.title}</T>
                  <Strike done={s.done} />
                </View>
              </View>
            ))}
          </View>

          <TextInput
            value={newSubtask}
            onChangeText={setNewSubtask}
            onSubmitEditing={() => {
              const v = newSubtask.trim();
              if (!v) return;
              addSubtask(task, v);
              setNewSubtask("");
            }}
            placeholder="Tambah subtask..."
            placeholderTextColor={th.c.ink40}
            returnKeyType="done"
            style={{ ...th.t.bodySm, color: th.c.ink, marginTop: 12, padding: 0 }}
          />
        </Section>

        <Section label="Catatan">
          <TextInput
            value={notes}
            onChangeText={setNotes}
            onBlur={() => {
              if (notes !== (task.notes ?? "")) {
                patchTask(task.id, { notes: notes.trim() || undefined });
              }
            }}
            placeholder="Tulis catatan..."
            placeholderTextColor={th.c.ink40}
            multiline
            style={{ ...th.t.bodySm, color: th.c.ink, padding: 0, minHeight: 60 }}
          />
        </Section>

        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: th.space[3],
            alignItems: "center",
            marginTop: th.space[5],
            paddingTop: th.space[3],
            borderTopWidth: 1,
            borderTopColor: th.c.line,
          }}
        >
          {task.status !== "doing" && !done && (
            <Action label="Mulai kerjain" onPress={() => startTask(task)} />
          )}
          <Action
            label="Arsipkan"
            onPress={() => {
              archiveTask(task);
              close();
            }}
          />
          <Action
            label="Hapus"
            accent
            onPress={() => {
              deleteTask(task);
              close();
            }}
          />
          <View style={{ flex: 1 }} />
          <Action label="Tutup" onPress={close} />
        </View>
      </ScrollView>
    </Screen>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  const th = useTheme();
  return (
    <View style={{ marginTop: th.space[5] }}>
      <T variant="h2" style={{ fontSize: 15, marginBottom: th.space[2] }}>
        {label}
      </T>
      {children}
    </View>
  );
}

function Action({
  label,
  onPress,
  accent,
}: {
  label: string;
  onPress: () => void;
  accent?: boolean;
}) {
  return (
    <Tappable onPress={onPress} style={{ minHeight: 44, justifyContent: "center" }}>
      <T variant="num" tone={accent ? "accent" : "ink40"}>
        {label}
      </T>
    </Tappable>
  );
}
