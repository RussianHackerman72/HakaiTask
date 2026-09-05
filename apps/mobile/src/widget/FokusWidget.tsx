/**
 * Widget layar utama — Focus Card yang sama, dirender ke RemoteViews Android.
 *
 * Dibatasi keras sama RemoteViews: gak ada ScrollView, gak ada Pressable, gak
 * ada font kustom yang gampang. Jadi ini sengaja cuma nampilin SATU hal —
 * task yang lagi jadi fokus — persis pertanyaan yang dijawab dashboard:
 * "apa sekarang?", bukan "apa aja yang ada?".
 */
import { FlexWidget, TextWidget } from "react-native-android-widget";
import { color } from "@hakaitask/tokens";

export interface FokusWidgetProps {
  title: string | null;
  when: string;
  /** Sisa task selain yang ditampilin. */
  rest: number;
  overdue: boolean;
  /** Dipakai buat deep-link pas widget-nya diketuk. */
  taskId?: string;
}

// Widget ikut tema gelap sistem? RemoteViews gak ngasih tau. Dipatok terang —
// lebih aman kebaca di wallpaper apa pun daripada gelap-di-atas-gelap.
const c = color.light;

export function FokusWidget({ title, when, rest, overdue, taskId }: FokusWidgetProps) {
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: taskId ? `hakaitask://task/${taskId}` : "hakaitask://" }}
      style={{
        height: "match_parent",
        width: "match_parent",
        flexDirection: "column",
        justifyContent: "center",
        backgroundColor: c.surface,
        borderRadius: 28,
        paddingHorizontal: 18,
        paddingVertical: 14,
      }}
    >
      {title === null ? (
        <TextWidget
          text="Kosong. Nikmatin dulu."
          style={{ fontSize: 15, fontWeight: "700", color: c.ink70 }}
        />
      ) : (
        <FlexWidget style={{ flexDirection: "column", width: "match_parent" }}>
          <TextWidget
            text={title}
            maxLines={2}
            style={{ fontSize: 17, fontWeight: "700", color: c.ink }}
          />
          <FlexWidget
            style={{ flexDirection: "row", alignItems: "center", marginTop: 6 }}
          >
            <TextWidget
              text={overdue ? "Lewat" : when}
              style={{ fontSize: 12, fontWeight: "600", color: overdue ? c.accent : c.ink40 }}
            />
            {rest > 0 ? (
              <TextWidget
                text={`  +${rest} lagi`}
                style={{ fontSize: 12, fontWeight: "600", color: c.ink40 }}
              />
            ) : (
              <TextWidget text="" style={{ fontSize: 12, color: c.ink40 }} />
            )}
          </FlexWidget>
        </FlexWidget>
      )}
    </FlexWidget>
  );
}
