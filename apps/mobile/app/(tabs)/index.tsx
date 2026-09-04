/**
 * Halaman utama — antarmuka perintah bahasa alami (PLAN-CHAT.md §1).
 *
 * Ini BUKAN asisten. Semua kalimat sistem berasal dari template di
 * `respond.ts`, dan seluruh keputusan diambil `chatTurn()` yang MURNI. Yang
 * dikerjain layar ini cuma tiga: nampilin, nerusin ketikan, dan ngejalanin
 * efek yang dibalikin mesin — sama persis kayak versi web.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  chatTurn,
  openingMessage,
  type DateRange,
  type Pending,
  type Ref,
} from "@hakaitask/core/chat";
import {
  applyEffect,
  clearHistory,
  loadHistory,
  saveHistory,
  useVocab,
  type StoredMessage,
} from "@hakaitask/app/chat";
import { useBusyBlocks, useTasks } from "@hakaitask/app/tasks";
import { useNow } from "@hakaitask/app";
import { useIdentity } from "../../src/auth";
import { headerDate } from "@hakaitask/app/format";
import { Screen } from "../../src/ui/Screen";
import { T } from "../../src/ui/T";
import { useTheme, useThemePref } from "../../src/theme";
import { Bubble } from "../../src/components/Bubble";
import { Composer } from "../../src/components/Composer";
import { Switch } from "../../src/ui/Switch";
import { Tappable } from "../../src/ui/Pressable";

export default function Chat() {
  const th = useTheme();
  const { toggle } = useThemePref();
  const router = useRouter();
  const { draft } = useLocalSearchParams<{ draft?: string }>();
  const now = useNow();
  const tasks = useTasks();
  const blocks = useBusyBlocks();
  const vocab = useVocab();
  const { userId, userName, signedIn } = useIdentity();

  // MMKV itu sinkron, jadi riwayatnya kebaca langsung pas state dibikin —
  // gak ada jeda "kosong dulu baru keisi" yang bisa ketimpa simpanan kosong.
  const [messages, setMessages] = useState<StoredMessage[]>(() => loadHistory());
  const [pending, setPending] = useState<Pending>(null);
  // Hari yang lagi dibahas, biar "hapus semua task di hari itu" nyambung ke
  // pertanyaan sebelumnya. Sengaja gak ikut disimpan: konteks percakapan
  // hilang begitu app ditutup, sama seperti pending.
  const [lastRange, setLastRange] = useState<DateRange | undefined>(undefined);
  const [value, setValue] = useState("");

  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);

  // Sapaan pembuka dihitung ulang tiap app dibuka & gak pernah disimpan (§2).
  // Sengaja cuma bergantung ke userName: `now` berdetak tiap menit dan bakal
  // bikin sapaannya nulis ulang terus.
  const opening = useMemo(
    () => openingMessage({ now, tasks, blocks, userName }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userName],
  );

  useEffect(() => {
    saveHistory(messages);
  }, [messages]);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [messages.length]);

  // Titipan dari halaman lain: isi kolomnya, fokusin, lalu LEPAS titipannya
  // biar gak keisi ulang tiap render — padanan `onDraftUsed()` di web.
  useEffect(() => {
    if (!draft) return;
    setValue(draft);
    inputRef.current?.focus();
    router.setParams({ draft: undefined });
  }, [draft, router]);

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      // `now` diambil SAAT KIRIM, bukan dari state — sesi yang kebuka lewat
      // tengah malam bakal salah ngartiin "hari ini" (E9).
      const at = new Date();

      const turn = chatTurn(trimmed, {
        now: at,
        tasks,
        blocks,
        vocab,
        pending,
        userName,
        ...(lastRange ? { lastRange } : {}),
      });

      for (const effect of turn.effects) applyEffect(effect, userId);

      setMessages((prev) => [
        ...prev,
        { role: "user", text: trimmed, at: at.getTime() },
        ...turn.messages.map((m) => ({ ...m, at: at.getTime() })),
      ]);
      setPending(turn.pending);
      setLastRange(turn.lastRange);
      setValue("");
    },
    [tasks, blocks, vocab, pending, lastRange, userName, userId],
  );

  /**
   * Bersihin percakapan. Pending dan `lastRange` WAJIB ikut direset — kalau
   * enggak, sisa "yang mana?" atau "hari itu" dari percakapan yang udah ilang
   * dari layar masih nempel diam-diam dan bikin balasan berikutnya aneh.
   */
  const clear = useCallback(() => {
    setMessages([]);
    setPending(null);
    setLastRange(undefined);
    clearHistory();
  }, []);

  const openRef = useCallback(
    (ref: Ref) => {
      if (ref.kind !== "task") return;
      router.push(`/task/${ref.id}`);
    },
    [router],
  );

  const shown = messages.length > 0 ? messages : [{ ...opening, at: now.getTime() }];

  return (
    <Screen pad={false}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: th.space[4],
            paddingBottom: th.space[2],
          }}
        >
          <T variant="meta" tone="ink40">{headerDate(now)}</T>
          <View style={{ flexDirection: "row", alignItems: "center", gap: th.space[2] }}>
            {!signedIn && (
              <Tappable
                onPress={() => router.push("/sign-in")}
                style={{
                  backgroundColor: th.c.surface,
                  borderRadius: th.radius.full,
                  paddingHorizontal: 12,
                  minHeight: 32,
                }}
              >
                <T variant="num" tone="ink70">Masuk</T>
              </Tappable>
            )}
            <Switch value={th.scheme === "dark"} onChange={toggle} />
          </View>
        </View>

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{
            paddingHorizontal: th.space[4],
            paddingBottom: th.space[4],
            gap: th.space[2],
          }}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          {shown.map((m, i) => (
            <Bubble key={`${m.at}-${i}`} message={m} onOpenRef={openRef} onPick={send} />
          ))}
        </ScrollView>

        <Composer
          value={value}
          onChange={setValue}
          onSubmit={() => send(value)}
          inputRef={inputRef}
          {...(messages.length > 0 ? { onClear: clear } : {})}
        />
      </KeyboardAvoidingView>
    </Screen>
  );
}
