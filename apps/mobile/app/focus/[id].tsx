/**
 * Layar fokus — §6.3. Layar penuh, minimalis maksimal.
 *
 * Yang kelihatan cuma empat: judul task, angka, subtask, dan dua tombol.
 * Sengaja gak ada navigasi, gak ada tab, gak ada apa pun yang ngajak pergi —
 * itu inti dari layar ini.
 */
import { useEffect } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useKeepAwake } from "expo-keep-awake";
import { useKaiStore } from "@hakaitask/core/store";
import { toggleSubtask } from "@hakaitask/app/tasks";
import type { FocusMode } from "@hakaitask/core/focus";
import { Screen } from "../../src/ui/Screen";
import { T } from "../../src/ui/T";
import { Pill } from "../../src/ui/Pill";
import { Chip } from "../../src/ui/Chip";
import { Tappable } from "../../src/ui/Pressable";
import { Checkbox, Strike } from "../../src/ui/Checkbox";
import { useTheme } from "../../src/theme";
import { useIdentity } from "../../src/auth";
import { useFocusTimer } from "../../src/useFocusTimer";

const MODES: { mode: FocusMode; label: string }[] = [
  { mode: "pomodoro", label: "Pomodoro" },
  { mode: "deep", label: "Deep work" },
  { mode: "stopwatch", label: "Stopwatch" },
];

const PHASE_LABEL: Record<string, string> = {
  work: "Fokus",
  break: "Istirahat",
  long_break: "Istirahat panjang",
};

export default function Focus() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const th = useTheme();
  const { userId } = useIdentity();
  const task = useKaiStore((s) => (id ? s.tasks[id] : undefined));
  const timer = useFocusTimer(userId, task?.title ?? "Lagi fokus");

  // Layar gak boleh mati pas lagi ngitung — orang ngeliatin angkanya.
  useKeepAwake();

  // Timer punya task LAIN? Jangan diam-diam ngerebut; balik aja.
  useEffect(() => {
    if (timer.view && timer.taskId && timer.taskId !== id) router.back();
  }, [timer.view, timer.taskId, id, router]);

  const v = timer.view;
  const running = v !== null;

  return (
    <Screen>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: th.space[4] }}>
        <T variant="h1" style={{ textAlign: "center" }} numberOfLines={3}>
          {task?.title ?? "Fokus"}
        </T>

        {!running ? (
          <>
            <T variant="bodySm" tone="ink70" style={{ textAlign: "center" }}>
              Pilih caranya, lalu mulai.
            </T>
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
              {MODES.map((m) => (
                <Chip key={m.mode} label={m.label} onPress={() => timer.start(m.mode, id)} />
              ))}
            </View>
            <Pill
              label="Atur app yang ditahan"
              tone="soft"
              onPress={() => router.push("/focus/setup")}
            />
            <Pill label="Kembali" tone="soft" onPress={() => router.back()} />
          </>
        ) : (
          <>
            <T variant="meta" tone="ink40">{PHASE_LABEL[v.phase] ?? "Fokus"}</T>

            {/*
              Mono + tabular: angka detik berubah tiap detik, dan kalau lebarnya
              gak dikunci seluruh baris goyang kiri-kanan terus.
            */}
            <T
              variant="mono"
              tabular
              style={{ fontSize: 72, lineHeight: 80 }}
            >
              {v.label}
            </T>

            {v.done && (
              <T variant="bodySm" tone="accent">
                {v.phase === "work" ? "Sesi selesai." : "Istirahat selesai."}
              </T>
            )}

            {task && task.subtasks.length > 0 && (
              <View style={{ gap: 10, alignSelf: "stretch", paddingHorizontal: th.space[3] }}>
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
                      <T variant="bodySm" tone={s.done ? "ink40" : "ink"}>{s.title}</T>
                      <Strike done={s.done} />
                    </View>
                  </View>
                ))}
              </View>
            )}

            <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
              <Pill
                label={v.paused ? "Lanjut" : "Jeda"}
                tone="soft"
                onPress={() => (v.paused ? timer.resume() : timer.pause())}
              />
              <Pill label="Selesai" onPress={() => timer.finish(false)} />
            </View>

            {/*
              "Terganggu" TIDAK nyetop timer (§6.3). Kalau mencetnya ngurangin
              waktu fokus, orang berhenti mencet, dan datanya jadi bohong.
            */}
            <Tappable onPress={timer.interrupt} style={{ paddingHorizontal: 16 }}>
              <T variant="num" tone="ink40">+ terganggu</T>
            </Tappable>

            <T variant="num" tone="ink40">
              sesi {v.sessionNumber} · terganggu {v.interruptions}
            </T>

            <Tappable
              onPress={() => {
                timer.finish(true);
                router.back();
              }}
              style={{ paddingHorizontal: 16 }}
            >
              <T variant="num" tone="ink40">Berhenti &amp; keluar</T>
            </Tappable>
          </>
        )}
      </View>
    </Screen>
  );
}
