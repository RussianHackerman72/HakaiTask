/**
 * Baris yang bisa digeser — §5.3 #16: kanan = selesai, kiri = snooze.
 *
 * Aksinya kepicu pas DILEPAS di luar ambang, bukan pas ngelewatin ambangnya:
 * kalau kepicu di tengah gerakan, geseran yang gak sengaja langsung ngubah
 * data dan gak ada jalan mundur. Ambangnya 35% lebar layar.
 *
 * Haptic-nya beda: `Success` buat selesai, `Light` buat snooze — biar kerasa
 * mana yang final dan mana yang cuma nunda.
 */
import type { ReactNode } from "react";
import { Dimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useTheme } from "../theme";
import { T } from "../ui/T";

const W = Dimensions.get("window").width;
const THRESHOLD = W * 0.35;

export function SwipeRow({
  children,
  onComplete,
  onSnooze,
}: {
  children: ReactNode;
  onComplete: () => void;
  onSnooze: () => void;
}) {
  const th = useTheme();
  const x = useSharedValue(0);

  function fire(dir: "right" | "left") {
    if (dir === "right") {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onComplete();
    } else {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onSnooze();
    }
  }

  const pan = Gesture.Pan()
    // Biar gak berebut sama scroll vertikal daftarnya.
    .activeOffsetX([-12, 12])
    .failOffsetY([-10, 10])
    .onUpdate((e) => {
      x.value = e.translationX;
    })
    .onEnd((e) => {
      if (e.translationX > THRESHOLD) runOnJS(fire)("right");
      else if (e.translationX < -THRESHOLD) runOnJS(fire)("left");
      x.value = withTiming(0, { duration: 160 });
    });

  const row = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const left = useAnimatedStyle(() => ({ opacity: Math.min(Math.max(x.value, 0) / THRESHOLD, 1) }));
  const right = useAnimatedStyle(() => ({ opacity: Math.min(Math.max(-x.value, 0) / THRESHOLD, 1) }));

  return (
    <View>
      {/* Latar aksi — kelihatan makin jelas makin jauh digeser. */}
      <View style={{ ...StyleSheetAbsolute, flexDirection: "row", alignItems: "center" }}>
        <Animated.View style={[{ flex: 1, paddingLeft: 20 }, left]}>
          <T variant="num" tone="ink40">✓ selesai</T>
        </Animated.View>
        <Animated.View style={[{ flex: 1, alignItems: "flex-end", paddingRight: 20 }, right]}>
          <T variant="num" tone="ink40">snooze →</T>
        </Animated.View>
      </View>

      <GestureDetector gesture={pan}>
        <Animated.View style={[{ backgroundColor: th.c.surface }, row]}>{children}</Animated.View>
      </GestureDetector>
    </View>
  );
}

const StyleSheetAbsolute = {
  position: "absolute" as const,
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
};
