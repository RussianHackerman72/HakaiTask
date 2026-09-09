/** Agenda terdekat: task + blok sibuk, urut waktu (§7.5). */
import { View } from "react-native";
import type { BusyBlock, Task } from "@hakaitask/core";
import { clock, isOverdue, snoozeTargets, whenLabel } from "@hakaitask/app/format";
import { completeTask, snoozeTask } from "@hakaitask/app/tasks";
import { useTheme } from "../theme";
import { T } from "../ui/T";
import { Card } from "../ui/Card";
import { Tappable } from "../ui/Pressable";
import { Checkbox, Strike } from "../ui/Checkbox";
import { SwipeRow } from "./SwipeRow";

// `buildEntries` sama tipenya pindah ke packages/app — dulu dia ada dua
// kali, sama persis, di berkas ini dan padanannya di platform satunya.
import type { UpcomingEntry } from "@hakaitask/app/upcoming";
export { buildEntries, type UpcomingEntry } from "@hakaitask/app/upcoming";

export function UpcomingList({
  entries,
  now,
  onOpen,
}: {
  entries: UpcomingEntry[];
  now: Date;
  onOpen: (task: Task) => void;
}) {
  const th = useTheme();
  if (entries.length === 0) return null;

  return (
    <View style={{ gap: th.space[2] }}>
      <T variant="h2" style={{ fontSize: 15 }}>Berikutnya</T>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        {entries.map((e, i) =>
          e.kind === "busy" ? (
            <BusyRow key={e.block.id} block={e.block} now={now} last={i === entries.length - 1} />
          ) : (
            <SwipeRow
              key={e.task.id}
              onComplete={() => completeTask(e.task)}
              onSnooze={() => snoozeTask(e.task, snoozeTargets(now)[0]!.at)}
            >
              <TaskRow
                task={e.task}
                now={now}
                onOpen={() => onOpen(e.task)}
                last={i === entries.length - 1}
              />
            </SwipeRow>
          ),
        )}
      </Card>
    </View>
  );
}

function rowStyle(th: ReturnType<typeof useTheme>, last: boolean) {
  return {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: th.space[3],
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: last ? 0 : 1,
    borderBottomColor: th.c.line,
  };
}

function TaskRow({
  task,
  now,
  onOpen,
  last,
}: {
  task: Task;
  now: Date;
  onOpen: () => void;
  last: boolean;
}) {
  const th = useTheme();
  const overdue = isOverdue(task, now);
  const when = whenLabel(task.dueAt ?? task.startAt, now, task.allDay);
  const done = task.status === "done";

  return (
    <View style={rowStyle(th, last)}>
      <Checkbox
        checked={done}
        onChange={() => completeTask(task)}
        label={`Selesaikan ${task.title}`}
        size={18}
      />

      <T variant="num" tone={overdue ? "accent" : "ink40"} style={{ width: 74 }}>
        {when}
      </T>

      <Tappable onPress={onOpen} haptic={false} style={{ flex: 1, minHeight: 0 }}>
        <View>
          <T variant="bodySm" numberOfLines={1}>{task.title}</T>
          <Strike done={done} />
        </View>
      </Tappable>

      {task.priority <= 2 && (
        <View
          style={{
            backgroundColor: task.priority === 1 ? th.c.accent : th.c.subtle,
            borderRadius: th.radius.full,
            paddingHorizontal: 8,
            paddingVertical: 3,
          }}
        >
          <T variant="num" style={{ color: task.priority === 1 ? th.c.surface : th.c.ink70 }}>
            P{task.priority}
          </T>
        </View>
      )}
    </View>
  );
}

function BusyRow({ block, now, last }: { block: BusyBlock; now: Date; last: boolean }) {
  const th = useTheme();
  const start = new Date(block.startAt);
  const sameDay = start.toDateString() === now.toDateString();

  return (
    <View style={rowStyle(th, last)}>
      <View style={{ width: 18 }} />
      <T variant="num" tone="ink40" style={{ width: 74 }}>
        {sameDay ? clock(start) : whenLabel(block.startAt, now)}
      </T>
      <T variant="bodySm" tone="ink70" numberOfLines={1} style={{ flex: 1 }}>
        {block.title}
      </T>
      <T variant="num" tone="ink40">sibuk</T>
    </View>
  );
}
