/**
 * Tombol tambah yang ngambang di pojok kanan bawah.
 *
 * Ngambang, bukan nempel di daftar: dashboard sama kalender dua-duanya bisa
 * digulung panjang, dan tombol yang ikut kegulung ke atas layar itu tombol
 * yang ilang persis pas lagi dibutuhin.
 *
 * Posisinya diangkat di atas tab bar plus safe-area — kalau enggak, di HP
 * bergestur dia duduk pas di garis geser sistem, dan setengah ketukannya
 * kebaca sebagai geser pulang.
 */
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme";
import { Tappable } from "../ui/Pressable";
import { T } from "../ui/T";

/** Tinggi tab bar bawaan expo-router, kira-kira. */
const TAB_BAR = 56;

export function FloatingAdd({ onPress }: { onPress: () => void }) {
  const th = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        position: "absolute",
        right: th.space[4],
        bottom: TAB_BAR + insets.bottom + th.space[3],
      }}
      // Cuma tombolnya yang nangkep sentuhan; sisanya tembus ke daftar di
      // bawahnya, biar area kosong di sekitarnya tetap bisa digulung.
      pointerEvents="box-none"
    >
      <Tappable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Tambah task"
        style={{
          width: 56,
          height: 56,
          borderRadius: th.radius.full,
          backgroundColor: th.c.ink,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Plus-nya teks, bukan ikon: app ini belum punya set ikon sama
            sekali, dan naruh satu SVG cuma buat satu tombol bikin dua sistem
            hidup bareng. */}
        <T variant="h2" tone="surface" style={{ fontSize: 28, lineHeight: 32 }}>
          +
        </T>
      </Tappable>
    </View>
  );
}
