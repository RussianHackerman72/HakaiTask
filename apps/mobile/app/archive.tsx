/**
 * Arsip — task yang disingkirin tapi gak dibuang.
 *
 * Sebelum layar ini ada, ngarsipin itu jalan satu arah. Tombolnya ada di layar
 * detail, dan sekali dipencet task-nya keluar dari `selectTasks`, dari papan
 * kanban (itu sengaja), dari pencarian chat, dan dari penjadwal notifikasi
 * sekaligus. Gak ada satu pun tempat buat ngeliat lagi apa yang udah
 * diarsipin, apalagi buat ngebalikinnya. Dari sisi user itu gak beda sama
 * kehapus — cuma tanpa peringatan yang biasanya nemenin penghapusan.
 *
 * Di luar `(tabs)` sama alasannya kayak Setelan: ini tempat yang dikunjungi
 * sesekali, bukan yang ditongkrongin.
 */
import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { unarchiveTask, useArchivedTasks } from "@hakaitask/app/tasks";
import { whenLabel } from "@hakaitask/app/format";
import { useNow } from "@hakaitask/app";
import { Screen } from "../src/ui/Screen";
import { T } from "../src/ui/T";
import { Card } from "../src/ui/Card";
import { Pill } from "../src/ui/Pill";
import { Tappable } from "../src/ui/Pressable";
import { useTheme } from "../src/theme";

export default function Archive() {
  const th = useTheme();
  const router = useRouter();
  const now = useNow();
  const tasks = useArchivedTasks();

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingVertical: th.space[3], gap: th.space[3] }}>
        <T variant="h1" style={{ fontSize: 26 }}>
          Arsip
        </T>

        <T variant="bodySm" tone="ink70">
          Task di sini gak ikut papan, gak ikut pencarian, dan gak bakal
          ngingetin kamu. Tapi gak kehapus — bisa dibalikin kapan aja.
        </T>

        {tasks.length === 0 ? (
          /*
            Kosong itu keadaan yang PALING sering di layar ini, jadi dia dapet
            kalimatnya sendiri. Layar kosong tanpa penjelasan gampang kebaca
            sebagai layar yang rusak.
          */
          <Card style={{ gap: 6 }}>
            <T variant="h2" style={{ fontSize: 15 }}>
              Belum ada yang diarsipin
            </T>
            <T variant="bodySm" tone="ink70">
              Buka satu task, lalu pilih “Arsipkan” kalau kamu pengin dia
              nyingkir dari papan tanpa dihapus.
            </T>
          </Card>
        ) : (
          <View style={{ gap: th.space[2] }}>
            {tasks.map((t) => (
              <Card key={t.id} style={{ gap: 8 }}>
                <Tappable
                  onPress={() => router.navigate(`/task/${t.id}`)}
                  haptic={false}
                  style={{ paddingHorizontal: 0 }}
                >
                  <T variant="h2" style={{ fontSize: 15 }}>
                    {t.title}
                  </T>
                </Tappable>

                {t.dueAt ? (
                  <T variant="meta" tone="ink40">
                    Tenggatnya dulu {whenLabel(t.dueAt, now, t.allDay)}
                  </T>
                ) : null}

                <Tappable
                  onPress={() => unarchiveTask(t)}
                  style={{ alignSelf: "flex-start", paddingHorizontal: 0 }}
                >
                  <T variant="num" style={{ color: th.c.ink }}>
                    Balikin ke daftar →
                  </T>
                </Tappable>
              </Card>
            ))}
          </View>
        )}

        <Pill label="Selesai" onPress={() => router.back()} />
      </ScrollView>
    </Screen>
  );
}
