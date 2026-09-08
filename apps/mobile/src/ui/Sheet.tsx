/**
 * Panel bawah — padanan `DetailSheet.tsx` di web.
 *
 * Ditulis tangan, bukan nambah `@gorhom/bottom-sheet`: yang dibutuhin app ini
 * cuma satu panel yang naik dari bawah, bisa ditarik turun, dan nutup kalau
 * latarnya diketuk. Reanimated sama gesture-handler dua-duanya udah kepasang
 * — nambah satu pustaka lagi berarti nambah modul native yang harus ikut tiap
 * build EAS, buat perilaku yang muat di berkas ini.
 *
 * Yang bikin panel bawah kerasa bener atau murahan cuma dua hal, dan
 * dua-duanya diurus di sini:
 *
 *   1. Tarikannya harus NGIKUT jari, bukan animasi yang jalan sesudah jari
 *      lepas. Makanya posisinya shared value yang digeser gesture handler
 *      langsung di UI thread.
 *   2. Nutupnya diputusin dari JARAK atau KECEPATAN, bukan cuma jarak.
 *      Sentakan pendek tapi cepat itu niat nutup yang jelas; ditolak gara-gara
 *      kurang 20px, panelnya kerasa lengket.
 */
import { useCallback, useEffect, type ReactNode } from "react";
import { BackHandler, Dimensions, Pressable, View, type ViewStyle } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme";

const LAYAR = Dimensions.get("window").height;

/** Ditarik lebih jauh dari ini → nutup. */
const JARAK_TUTUP = 120;
/** Atau dilempar lebih cepat dari ini, walau jaraknya pendek. */
const LAJU_TUTUP = 900;

export function Sheet({
  open,
  onClose,
  children,
  style,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  style?: ViewStyle;
}) {
  const th = useTheme();
  const insets = useSafeAreaInsets();

  const y = useSharedValue(LAYAR);
  const gelap = useSharedValue(0);

  useEffect(() => {
    y.value = open ? withSpring(0, th.spring.standard) : withTiming(LAYAR, { duration: 200 });
    gelap.value = withTiming(open ? 1 : 0, { duration: 200 });
  }, [open, y, gelap, th.spring.standard]);

  // Tombol back nutup panel, bukan ninggalin layar di belakangnya. Tanpa ini
  // panelnya kebuka lalu layarnya pindah — dan panelnya masih kebuka pas balik.
  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [open, onClose]);

  const tutup = useCallback(() => onClose(), [onClose]);

  const tarik = Gesture.Pan()
    .onUpdate((e) => {
      // Cuma ke bawah. Narik ke atas gak nambah apa-apa dan bikin panelnya
      // ngambang di atas tempatnya.
      y.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > JARAK_TUTUP || e.velocityY > LAJU_TUTUP) {
        y.value = withTiming(LAYAR, { duration: 180 }, () => runOnJS(tutup)());
      } else {
        y.value = withSpring(0, th.spring.standard);
      }
    });

  const panel = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  const latar = useAnimatedStyle(() => ({ opacity: gelap.value }));

  // Dilepas dari pohon pas ketutup: panel yang cuma digeser keluar layar tetap
  // nangkep sentuhan di beberapa perangkat, dan isinya tetap ke-render.
  if (!open) return null;

  return (
    <View style={StyleSheetAbsolute} pointerEvents="box-none">
      <Animated.View style={[StyleSheetAbsolute, { backgroundColor: "#000" }, latar]}>
        <Pressable
          style={{ flex: 1 }}
          onPress={onClose}
          // Latar gelap itu tombol tutup yang gak kelihatan — pembaca layar
          // harus tau itu bisa dipencet.
          accessibilityRole="button"
          accessibilityLabel="Tutup"
        />
      </Animated.View>

      <GestureDetector gesture={tarik}>
        <Animated.View
          style={[
            {
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: th.c.paper,
              borderTopLeftRadius: th.radius.lg,
              borderTopRightRadius: th.radius.lg,
              paddingHorizontal: th.space[4],
              paddingTop: th.space[3],
              paddingBottom: insets.bottom + th.space[4],
              maxHeight: LAYAR * 0.9,
            },
            panel,
            style,
          ]}
        >
          {/* Gagang. Gak punya fungsi sendiri — dia cuma ngasih tau panelnya
              bisa ditarik, dan tanpa itu gestur tariknya jadi rahasia. */}
          <View
            style={{
              alignSelf: "center",
              width: 36,
              height: 4,
              borderRadius: th.radius.full,
              backgroundColor: th.c.line,
              marginBottom: th.space[3],
            }}
          />
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const StyleSheetAbsolute = {
  position: "absolute" as const,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
};
