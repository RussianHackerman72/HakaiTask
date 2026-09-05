/**
 * Dashboard — jawab "apa sekarang?", bukan "apa aja yang ada?" (§7.5).
 *
 * Sengaja TANPA sapaan: sapaan tempatnya di chat. Dashboard itu alat.
 */
import { useMemo } from "react";
import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useBusyBlocks, useFocus, useTasks } from "@hakaitask/app/tasks";
import { useNow } from "@hakaitask/app";
import { headerDate } from "@hakaitask/app/format";
import { Screen } from "../../src/ui/Screen";
import { T } from "../../src/ui/T";
import { Card } from "../../src/ui/Card";
import { Pill } from "../../src/ui/Pill";
import { useTheme } from "../../src/theme";
import { FocusCard } from "../../src/components/FocusCard";
import { UpcomingList, buildEntries } from "../../src/components/UpcomingList";

export default function Dashboard() {
  const th = useTheme();
  const router = useRouter();
  const now = useNow();
  const tasks = useTasks();
  const blocks = useBusyBlocks();
  const focus = useFocus(now);

  const entries = useMemo(
    () => buildEntries(focus.upcoming, blocks, now),
    [focus.upcoming, blocks, now],
  );

  const doneToday = useMemo(
    () =>
      tasks.filter(
        (t) =>
          t.status === "done" &&
          t.completedAt &&
          new Date(t.completedAt).toDateString() === now.toDateString(),
      ).length,
    [tasks, now],
  );

  const goChat = (draft: string) =>
    router.push({ pathname: "/(tabs)", params: { draft } });

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingVertical: th.space[3], gap: th.space[4] }}>
        <T variant="meta" tone="ink40">{headerDate(now)}</T>

        {focus.focus ? (
          <>
            <FocusCard
              task={focus.focus}
              now={now}
              onOpen={() => router.push(`/task/${focus.focus!.id}`)}
            />
            {/* Jalan pintas: dari "apa sekarang?" langsung ke ngerjain. */}
            <Pill
              label="Mulai fokus"
              onPress={() => router.push(`/focus/${focus.focus!.id}`)}
              style={{ alignSelf: "flex-start" }}
            />
          </>
        ) : (
          <Empty doneToday={doneToday} onAdd={() => goChat("tambahin ")} />
        )}

        <UpcomingList
          entries={entries}
          now={now}
          onOpen={(t) => router.push(`/task/${t.id}`)}
        />
      </ScrollView>
    </Screen>
  );
}

/**
 * Dua keadaan ini beda arti dan gak boleh dikasih pesan yang sama:
 * belum ada apa-apa → ajakin nulis; udah kelar semua → RAYAIN.
 */
function Empty({ doneToday, onAdd }: { doneToday: number; onAdd: () => void }) {
  const th = useTheme();
  const allDone = doneToday > 0;

  return (
    <Card style={{ gap: th.space[2] }}>
      <T variant="h2" style={{ fontSize: 22 }}>
        {allDone ? "Beres semua. Mantap." : "Kosong. Nikmatin dulu."}
      </T>
      <T variant="bodySm" tone="ink70">
        {allDone
          ? `${doneToday} task kelar hari ini. Sisanya buat besok.`
          : "Kalau ada yang kepikiran, tulis aja apa adanya."}
      </T>
      <Pill
        label={allDone ? "Tambah satu lagi" : "Tambah task"}
        onPress={onAdd}
        style={{ marginTop: th.space[2], alignSelf: "flex-start" }}
      />
    </Card>
  );
}
