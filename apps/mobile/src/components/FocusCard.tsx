/** Satu task terpilih — menjawab "apa sekarang?", bukan "apa aja yang ada?" (§7.5). */
import { View } from "react-native";
import type { Task } from "@hakaitask/core";
import { durationLabel, isOverdue, whenLabel } from "@hakaitask/app/format";
import { completeTask, subtaskProgress } from "@hakaitask/app/tasks";
import { useTheme } from "../theme";
import { T } from "../ui/T";
import { Card } from "../ui/Card";
import { Tappable } from "../ui/Pressable";
import { Checkbox, Strike } from "../ui/Checkbox";

export function FocusCard({ task, now, onOpen }: { task: Task; now: Date; onOpen: () => void }) {
  const th = useTheme();
  const overdue = isOverdue(task, now);
  const { done, total } = subtaskProgress(task);
  const isDone = task.status === "done";

  const when = whenLabel(task.dueAt, now, task.allDay);
  const duration = durationLabel(task.estimateMin);

  return (
    <Card
      style={{
        padding: th.space[4],
        ...(overdue ? { borderWidth: 2, borderColor: th.c.accent } : {}),
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: th.space[3] }}>
        <View style={{ paddingTop: 4 }}>
          <Checkbox
            checked={isDone}
            onChange={() => completeTask(task)}
            label={`Selesaikan ${task.title}`}
          />
        </View>

        <Tappable
          onPress={onOpen}
          haptic={false}
          style={{ flex: 1, minHeight: 0, justifyContent: "flex-start" }}
        >
          <View>
            <View>
              <T variant="h1" style={{ fontSize: 26, lineHeight: 32 }}>{task.title}</T>
              <Strike done={isDone} />
            </View>

            {(task.priority <= 2 || when || duration) && (
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: 8,
                  marginTop: th.space[2],
                }}
              >
                {overdue && <Tag label="Lewat" bg={th.c.accent} fg={th.c.surface} />}
                {task.priority <= 2 && (
                  <Tag
                    label={`P${task.priority}`}
                    bg={overdue ? th.c.subtle : th.c.ink}
                    fg={overdue ? th.c.ink70 : th.c.surface}
                  />
                )}
                {when ? <T variant="num" tone="ink40">{when}</T> : null}
                {duration ? <T variant="num" tone="ink40">{duration}</T> : null}
              </View>
            )}

            {total > 0 && (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: th.space[2],
                  marginTop: th.space[3],
                }}
              >
                <View
                  style={{
                    flex: 1,
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: th.c.line,
                    overflow: "hidden",
                  }}
                >
                  <View
                    style={{
                      width: `${(done / total) * 100}%`,
                      height: "100%",
                      backgroundColor: th.c.ink,
                    }}
                  />
                </View>
                <T variant="num" tone="ink40">{done}/{total}</T>
              </View>
            )}
          </View>
        </Tappable>
      </View>
    </Card>
  );
}

function Tag({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  const th = useTheme();
  return (
    <View
      style={{
        backgroundColor: bg,
        borderRadius: th.radius.full,
        paddingHorizontal: 10,
        paddingVertical: 4,
      }}
    >
      <T variant="num" style={{ color: fg }}>{label}</T>
    </View>
  );
}
