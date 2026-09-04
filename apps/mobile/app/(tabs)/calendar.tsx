/**
 * Kalender bulanan (§5.1) — grid 6×7 plus agenda hari yang dipilih.
 *
 * Kalender sengaja GAK punya kolom ketik sendiri: semua penambahan lewat chat.
 * Tanggal yang lagi dipilih dititipin sebagai teks awal, jadi user tinggal
 * nulis judulnya dan task-nya mendarat di hari yang bener.
 */
import { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import {
  addMonths,
  blocksOnDate,
  monthLabel,
  monthMatrix,
  sameDay,
  tasksOnDate,
} from "@hakaitask/app/calendar";
import { clock, headerDate, isOverdue } from "@hakaitask/app/format";
import { completeTask } from "@hakaitask/app/tasks";
import { useBusyBlocks, useTasks } from "@hakaitask/app/tasks";
import { useNow } from "@hakaitask/app";
import { Screen } from "../../src/ui/Screen";
import { T } from "../../src/ui/T";
import { Card } from "../../src/ui/Card";
import { Pill } from "../../src/ui/Pill";
import { Tappable } from "../../src/ui/Pressable";
import { Checkbox, Strike } from "../../src/ui/Checkbox";
import { useTheme } from "../../src/theme";

const HARI_PENDEK = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

/** "12 agustus" — bentuk yang langsung dimengerti parser tanggal. */
const BULAN_PARSER = [
  "januari", "februari", "maret", "april", "mei", "juni",
  "juli", "agustus", "september", "oktober", "november", "desember",
];

function tanggalUntukChat(d: Date): string {
  return d.getDate() + " " + BULAN_PARSER[d.getMonth()];
}

export default function Calendar() {
  const th = useTheme();
  const router = useRouter();
  const now = useNow();
  const tasks = useTasks();
  const blocks = useBusyBlocks();

  const [viewMonth, setViewMonth] = useState(
    () => new Date(now.getFullYear(), now.getMonth(), 1),
  );
  const [selected, setSelected] = useState<Date>(() => new Date(now));

  const days = useMemo(
    () => monthMatrix(viewMonth.getFullYear(), viewMonth.getMonth()),
    [viewMonth],
  );
  const selectedTasks = useMemo(() => tasksOnDate(tasks, selected), [tasks, selected]);
  const selectedBlocks = useMemo(() => blocksOnDate(blocks, selected), [blocks, selected]);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingVertical: th.space[3], gap: th.space[4] }}>
        {/*
          Judul bulan dikasih BARIS SENDIRI, bukan rebutan sama tombol navigasi.
          Waktu satu baris, "September 2026" kepotong jadi "September …" di
          layar 1080px — tombolnya makan ~390px dan sisanya gak cukup.
        */}
        <T variant="h1" style={{ fontSize: 28 }} numberOfLines={1}>
          {monthLabel(viewMonth)}
        </T>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Nav label="‹" onPress={() => setViewMonth((m) => addMonths(m, -1))} />
          <Pill
            label="Hari ini"
            tone="soft"
            style={{ paddingVertical: 8, paddingHorizontal: 14 }}
            onPress={() => {
              setViewMonth(new Date(now.getFullYear(), now.getMonth(), 1));
              setSelected(new Date(now));
            }}
          />
          <Nav label="›" onPress={() => setViewMonth((m) => addMonths(m, 1))} />
          <View style={{ flex: 1 }} />
        </View>

        <Card style={{ padding: th.space[2] }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {HARI_PENDEK.map((h) => (
              <View key={h} style={{ width: `${100 / 7}%`, alignItems: "center", paddingBottom: 6 }}>
                <T variant="meta" tone="ink40">{h}</T>
              </View>
            ))}

            {days.map((day) => {
              const inMonth = day.getMonth() === viewMonth.getMonth();
              const isToday = sameDay(day, now);
              const isSelected = sameDay(day, selected);
              const dayTasks = tasksOnDate(tasks, day);
              const count = dayTasks.length + blocksOnDate(blocks, day).length;
              const anyOverdue = dayTasks.some((t) => isOverdue(t, now));

              return (
                <View key={day.toISOString()} style={{ width: `${100 / 7}%`, padding: 2 }}>
                  <Pressable
                    onPress={() => setSelected(day)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={
                      headerDate(day) + (count > 0 ? ", " + count + " agenda" : ", kosong")
                    }
                    style={{
                      height: 44,
                      borderRadius: 16,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: isSelected
                        ? th.c.ink
                        : isToday
                          ? th.c.subtle
                          : "transparent",
                    }}
                  >
                    <T
                      variant="bodySm"
                      style={{
                        fontFamily: "PlusJakartaSans_700Bold",
                        color: isSelected ? th.c.surface : inMonth ? th.c.ink : th.c.ink40,
                      }}
                    >
                      {day.getDate()}
                    </T>

                    {/* Sampai 3 titik — sekilas kelihatan padat-enggaknya suatu
                        hari, bukan cuma "ada isinya". Merah kalau ada yang telat. */}
                    {count > 0 && (
                      <View style={{ flexDirection: "row", gap: 2, marginTop: 3 }}>
                        {Array.from({ length: Math.min(count, 3) }).map((_, i) => (
                          <View
                            key={i}
                            style={{
                              width: 4,
                              height: 4,
                              borderRadius: 2,
                              backgroundColor: anyOverdue
                                ? th.c.accent
                                : isSelected
                                  ? th.c.surface
                                  : th.c.ink70,
                            }}
                          />
                        ))}
                      </View>
                    )}
                  </Pressable>
                </View>
              );
            })}
          </View>
        </Card>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: th.space[2],
          }}
        >
          <T variant="h2" style={{ flex: 1 }} numberOfLines={1}>
            {headerDate(selected)}
          </T>
          <Pill
            label="+ Tambah"
            style={{ paddingVertical: 8, paddingHorizontal: 16 }}
            onPress={() =>
              router.push({
                pathname: "/(tabs)",
                params: { draft: "tambahin " + tanggalUntukChat(selected) + " " },
              })
            }
          />
        </View>

        {selectedTasks.length === 0 && selectedBlocks.length === 0 ? (
          <T variant="bodySm" tone="ink40">Gak ada apa-apa di tanggal ini.</T>
        ) : (
          <View style={{ gap: 8 }}>
            {selectedBlocks.map((b) => (
              <Card
                key={b.id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: th.space[2],
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  borderRadius: th.radius.sm,
                }}
              >
                <T variant="num" tone="ink40" style={{ width: 58 }}>
                  {clock(new Date(b.startAt))}
                </T>
                <T variant="bodySm" tone="ink70" numberOfLines={1} style={{ flex: 1 }}>
                  {b.title}
                </T>
                <T variant="num" tone="ink40">sibuk</T>
              </Card>
            ))}

            {selectedTasks.map((task) => {
              const done = task.status === "done";
              return (
                <Card
                  key={task.id}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: th.space[2],
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    borderRadius: th.radius.sm,
                  }}
                >
                  <Checkbox
                    checked={done}
                    onChange={() => completeTask(task)}
                    label={"Selesaikan " + task.title}
                    size={20}
                  />
                  {!task.allDay && task.dueAt ? (
                    <T variant="num" tone="ink40" style={{ width: 58 }}>
                      {clock(new Date(task.dueAt))}
                    </T>
                  ) : null}
                  <Tappable
                    onPress={() => router.push("/task/" + task.id)}
                    haptic={false}
                    style={{ flex: 1, minHeight: 0 }}
                  >
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
                      <T
                        variant="num"
                        style={{ color: task.priority === 1 ? th.c.surface : th.c.ink70 }}
                      >
                        P{task.priority}
                      </T>
                    </View>
                  )}
                </Card>
              );
            })}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

function Nav({ label, onPress }: { label: string; onPress: () => void }) {
  const th = useTheme();
  return (
    <Tappable
      onPress={onPress}
      style={{
        width: 40,
        height: 40,
        borderRadius: th.radius.full,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: th.c.surface,
      }}
    >
      <T variant="h2" style={{ fontSize: 18 }}>{label}</T>
    </Tappable>
  );
}
