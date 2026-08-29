/**
 * Layar bukti-hidup buat tahap 4 — sengaja belum ada UI beneran.
 *
 * Yang dibuktiin di sini cuma satu: seluruh pipa jalan. `openingMessage()`
 * itu fungsi murni di core yang baca DUA berkas kamus JSON, jadi kalau
 * kalimatnya nongol, artinya Metro berhasil nyelesaiin subpath export
 * `@hakaitask/core/chat`, spesifier ".js" yang nunjuk ke ".ts", dan impor
 * JSON tanpa import attribute — tiga hal yang jadi alasan tahap 1 ada.
 */
import { useMemo, useState } from "react";
import { Pressable, SafeAreaView, ScrollView, Text, View } from "react-native";
import { openingMessage } from "@hakaitask/core/chat";
import { useKaiStore } from "@hakaitask/core/store";
import { makeTask } from "@hakaitask/core";
import { newId, useTasks } from "@hakaitask/app/tasks";
import { headerDate } from "@hakaitask/app/format";

export default function Index() {
  const [now] = useState(() => new Date());
  const tasks = useTasks();

  const salam = useMemo(
    () => openingMessage({ now, tasks, blocks: [], userName: "Kai" }).text,
    [now, tasks],
  );

  function tambah() {
    useKaiStore.getState().upsertTask(
      makeTask({
        id: newId(),
        userId: "local",
        title: `Uji MMKV ${new Date().toLocaleTimeString("id-ID")}`,
        allDay: false,
        tags: [],
        subtasks: [],
      }),
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F0F0F0" }}>
      <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }}>
        <Text style={{ fontSize: 13, fontWeight: "700", color: "#66666D" }}>
          {headerDate(now).toUpperCase()}
        </Text>

        <View style={{ backgroundColor: "#FFFFFF", borderRadius: 28, padding: 20 }}>
          <Text style={{ fontSize: 16, lineHeight: 24, color: "#0D0D0F" }}>{salam}</Text>
        </View>

        <Pressable
          onPress={tambah}
          style={{
            backgroundColor: "#0D0D0F",
            borderRadius: 9999,
            minHeight: 44,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 24,
          }}
        >
          <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>Tambah task uji</Text>
        </Pressable>

        <Text style={{ fontSize: 13, fontWeight: "700", color: "#66666D" }}>
          {tasks.length} task tersimpan — tutup paksa app, buka lagi, harus tetap ada
        </Text>

        {tasks.map((t) => (
          <View key={t.id} style={{ backgroundColor: "#FFFFFF", borderRadius: 14, padding: 14 }}>
            <Text style={{ color: "#0D0D0F" }}>{t.title}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
