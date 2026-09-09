/**
 * Papan kanban — tiga kolom, digeser mendatar.
 *
 * Di layar selebar HP, tiga kolom berdampingan artinya tiap kolom cuma
 * selebar seperempat layar, dan judul task jadi dua huruf plus elipsis. Jadi
 * kolomnya SELEBAR LAYAR dan digeser mendatar, satu kolom sekali lihat —
 * bentuk yang sama yang dipakai app papan lain di HP, karena alasannya sama.
 *
 * Kartunya dipindah lewat MENU, bukan seret-dan-lepas. Itu keputusan, bukan
 * kekurangan: seret di dalam daftar yang juga bisa digulir, di dalam halaman
 * yang juga bisa digeser mendatar, artinya tiga gestur rebutan satu jari.
 * Yang gagal duluan biasanya gulirannya, dan papan yang gak bisa digulir itu
 * lebih rusak daripada papan tanpa seret. Menu "Pindah ke" nyampein maksud
 * yang sama dalam dua ketukan, dan gak pernah salah tangkap.
 *
 * Aritmatika urutannya gak ada di sini sama sekali — semuanya di
 * `@hakaitask/app/kanban`, dipakai bareng sama web.
 */
import { useMemo, useState } from "react";
import { Dimensions, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useTasks } from "@hakaitask/app/tasks";
import { applyBoardMove } from "@hakaitask/app/tasks";
import {
  KANBAN_COLUMNS,
  KANBAN_LABEL,
  board,
  planMove,
  type KanbanColumn,
} from "@hakaitask/app/kanban";
import { whenLabel } from "@hakaitask/app/format";
import { useNow } from "@hakaitask/app";
import type { Task } from "@hakaitask/core";
import { Screen } from "../../src/ui/Screen";
import { T } from "../../src/ui/T";
import { Card } from "../../src/ui/Card";
import { Chip } from "../../src/ui/Chip";
import { Sheet } from "../../src/ui/Sheet";
import { Tappable } from "../../src/ui/Pressable";
import { useTheme } from "../../src/theme";
import { useTabBarSpace } from "../../src/components/FloatingTabBar";

const LEBAR = Dimensions.get("window").width;

export default function Kanban() {
  const th = useTheme();
  const router = useRouter();
  const now = useNow();
  const tasks = useTasks();
  const tabSpace = useTabBarSpace();

  const kolom = useMemo(() => board(tasks), [tasks]);
  const [dipilih, setDipilih] = useState<Task | null>(null);

  const pindah = (t: Task, ke: KanbanColumn) => {
    // Selalu mendarat di PUCUK kolom tujuan. Di layar HP, kartu yang mendarat
    // di tengah tumpukan lalu gak kelihatan itu kerasa kayak kartunya ilang.
    const plan = planMove(tasks, t.id, ke, 0);
    if (plan) applyBoardMove(t.id, plan);
    setDipilih(null);
  };

  return (
    <Screen pad={false}>
      <View style={{ paddingHorizontal: th.space[4], paddingVertical: th.space[3] }}>
        <T variant="h1" style={{ fontSize: 26 }}>
          Papan
        </T>
      </View>

      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        // Tiap kolom selebar layar; `pagingEnabled` bikin gesernya mendarat
        // pas di kolom, bukan berhenti di tengah dua kolom.
        style={{ flex: 1 }}
      >
        {KANBAN_COLUMNS.map((col) => (
          <View key={col} style={{ width: LEBAR, paddingHorizontal: th.space[4] }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: th.space[2],
                marginBottom: th.space[2],
              }}
            >
              <T variant="h2" style={{ fontSize: 15 }}>
                {KANBAN_LABEL[col]}
              </T>
              <T variant="num" tone="ink40">
                {kolom[col].length}
              </T>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ gap: th.space[2], paddingBottom: tabSpace + th.space[4] }}
            >
              {kolom[col].length === 0 ? (
                <T variant="bodySm" tone="ink40">
                  Kosong.
                </T>
              ) : (
                kolom[col].map((t) => (
                  <Card key={t.id} style={{ gap: 6, padding: th.space[3] }}>
                    <Tappable onPress={() => router.push(`/task/${t.id}`)} haptic={false}>
                      <T variant="body">{t.title}</T>
                    </Tappable>

                    <View style={{ flexDirection: "row", alignItems: "center", gap: th.space[2] }}>
                      {t.dueAt ? (
                        <T variant="meta" tone="ink40">
                          {whenLabel(t.dueAt, now, t.allDay)}
                        </T>
                      ) : null}
                      <View style={{ flex: 1 }} />
                      <Tappable
                        onPress={() => setDipilih(t)}
                        accessibilityLabel={`Pindahin ${t.title}`}
                        style={{ paddingHorizontal: 8, minHeight: 32 }}
                      >
                        <T variant="num" tone="ink40">
                          Pindah →
                        </T>
                      </Tappable>
                    </View>
                  </Card>
                ))
              )}
            </ScrollView>
          </View>
        ))}
      </ScrollView>

      <Sheet open={dipilih !== null} onClose={() => setDipilih(null)}>
        <View style={{ gap: th.space[3] }}>
          <T variant="h2" style={{ fontSize: 18 }}>
            {dipilih?.title}
          </T>
          <T variant="meta" tone="ink40">
            Pindahin ke
          </T>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {KANBAN_COLUMNS.map((col) => (
              <Chip
                key={col}
                label={KANBAN_LABEL[col]}
                active={dipilih?.status === col}
                onPress={() => dipilih && pindah(dipilih, col)}
              />
            ))}
          </View>
        </View>
      </Sheet>
    </Screen>
  );
}
