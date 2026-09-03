/**
 * Detail task — SEMENTARA (tahap 6). Versi lengkapnya (subtask, prioritas,
 * snooze, catatan) nyusul di tahap 7.
 *
 * Ditaruh sebagai ROUTE, bukan komponen lokal, karena nanti dia jadi tujuan
 * deep-link tiap notifikasi (§6.7 aturan 3). Datanya dibaca dari store lewat
 * id — bukan disalin ke state — biar ikut ke-update kalau berubah dari device
 * lain.
 */
import { useLocalSearchParams, useRouter } from "expo-router";
import { View } from "react-native";
import { useKaiStore } from "@hakaitask/core/store";
import { completeTask, uncompleteTask } from "@hakaitask/app/tasks";
import { durationLabel, isOverdue, metaLine, whenLabel } from "@hakaitask/app/format";
import { useNow } from "@hakaitask/app";
import { Screen } from "../../src/ui/Screen";
import { Card } from "../../src/ui/Card";
import { Pill } from "../../src/ui/Pill";
import { T } from "../../src/ui/T";
import { useTheme } from "../../src/theme";

export default function TaskDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const th = useTheme();
  const now = useNow();
  const task = useKaiStore((s) => (id ? s.tasks[id] : undefined));

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
  const late = isOverdue(task, now);

  return (
    <Screen>
      <View style={{ gap: th.space[3], paddingTop: th.space[4] }}>
        <T variant="h1">{task.title}</T>

        <T variant="meta" tone={late ? "accent" : "ink40"}>
          {metaLine([
            `P${task.priority}`,
            whenLabel(task.dueAt, now, task.allDay),
            durationLabel(task.estimateMin),
            late && "lewat tenggat",
          ])}
        </T>

        {task.notes ? (
          <Card>
            <T variant="bodySm" tone="ink70">{task.notes}</T>
          </Card>
        ) : null}

        {task.subtasks.length > 0 && (
          <Card style={{ gap: 8 }}>
            {task.subtasks.map((s) => (
              <T key={s.id} variant="bodySm" tone={s.done ? "ink40" : "ink"}>
                {s.done ? "● " : "○ "}
                {s.title}
              </T>
            ))}
          </Card>
        )}

        <Pill
          label={done ? "Batalin selesai" : "Tandai selesai"}
          onPress={() => (done ? uncompleteTask(task) : completeTask(task))}
        />
        <Pill label="Kembali" tone="soft" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
