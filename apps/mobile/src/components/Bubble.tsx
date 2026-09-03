/**
 * Gelembung pesan. Punya user rata kanan & isian ink; balasan sistem rata
 * kiri di atas kartu.
 *
 * Balasan sistem sering multi-baris (daftar agenda, konfirmasi hapus), dan
 * `Text` di RN emang ngehormatin "\n" apa adanya — jadi gak perlu padanan
 * `whitespace-pre-wrap` kayak di web.
 */
import { View } from "react-native";
import type { Ref } from "@hakaitask/core/chat";
import type { StoredMessage } from "@hakaitask/app/chat";
import { useTheme } from "../theme";
import { T } from "../ui/T";
import { Tappable } from "../ui/Pressable";

export function Bubble({
  message,
  onOpenRef,
  onPick,
}: {
  message: StoredMessage;
  onOpenRef: (ref: Ref) => void;
  onPick: (text: string) => void;
}) {
  const th = useTheme();
  const mine = message.role === "user";
  const refs = (message.refs ?? []).filter((r) => r.kind === "task");
  const choices = message.choices ?? [];

  return (
    <View style={{ flexDirection: "row", justifyContent: mine ? "flex-end" : "flex-start" }}>
      <View
        style={{
          maxWidth: "85%",
          backgroundColor: mine ? th.c.ink : th.c.surface,
          borderRadius: th.radius.md,
          paddingHorizontal: 20,
          paddingVertical: 12,
        }}
      >
        <T variant="bodySm" tone={mine ? "surface" : "ink"}>
          {message.text}
        </T>

        {refs.length > 0 && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
            {refs.map((r) => (
              <Tappable
                key={r.id}
                onPress={() => onOpenRef(r)}
                style={{
                  backgroundColor: th.c.paper,
                  borderRadius: th.radius.full,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  minHeight: 32,
                }}
              >
                <T variant="num" tone="ink70">{r.title}</T>
              </Tappable>
            ))}
          </View>
        )}

        {choices.length > 0 && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
            {choices.map((c) => (
              <Tappable
                key={c}
                onPress={() => onPick(c)}
                style={{
                  borderWidth: 1,
                  borderColor: th.c.line,
                  borderRadius: th.radius.full,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  minHeight: 32,
                }}
              >
                <T variant="num">{c}</T>
              </Tappable>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}
