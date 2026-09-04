/**
 * Kotak centang dengan garis yang DIGAMBAR 180ms (§7.4 langkah 1), plus judul
 * yang dicoret nyapu kiri→kanan 240ms (langkah 2).
 *
 * Ini interaksi yang paling sering dilakuin di seluruh app, jadi dia dapat
 * perhatian sendiri — bukan cuma ganti ikon.
 */
import { useEffect } from "react";
import { Pressable, View, type ViewStyle } from "react-native";
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  Easing,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import * as Haptics from "expo-haptics";
import { motion } from "@hakaitask/tokens";
import { useTheme } from "../theme";

const AnimatedPath = Animated.createAnimatedComponent(Path);

// expo-out, sama persis kayak `--ease-standard` di web.
const STANDARD = Easing.bezier(0.22, 1, 0.36, 1);

/** Panjang kira-kira path centangnya — dipakai buat strokeDashoffset. */
const LEN = 16;

export function Checkbox({
  checked,
  onChange,
  label,
  size = 22,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  size?: number;
}) {
  const th = useTheme();
  const p = useSharedValue(checked ? 1 : 0);

  useEffect(() => {
    p.value = withTiming(checked ? 1 : 0, { duration: 180, easing: STANDARD });
  }, [checked, p]);

  const pathProps = useAnimatedProps(() => ({
    strokeDashoffset: LEN * (1 - p.value),
    opacity: p.value,
  }));

  /**
   * Area sentuh dipaksa 44px (WCAG 2.5.5 / Apple HIG) walau lingkarannya
   * kecil. Margin negatif nahan supaya padding ekstra ini gak ngedorong
   * layout — sama triknya kayak di web.
   */
  const pad = Math.max(0, (44 - size) / 2);

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      onPress={() => {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onChange();
      }}
      style={{ padding: pad, margin: -pad }}
    >
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 2,
          borderColor: th.c.ink40,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Svg width={size * 0.55} height={size * 0.55} viewBox="0 0 12 12">
          <AnimatedPath
            d="M1.5 6.4 L4.6 9.4 L10.5 2.8"
            stroke={th.c.ink}
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            strokeDasharray={LEN}
            animatedProps={pathProps}
          />
        </Svg>
      </View>
    </Pressable>
  );
}

/** Coretan judul. Ditunda `fast` biar centangnya kelar duluan (§7.4 urutan). */
export function Strike({ done, style }: { done: boolean; style?: ViewStyle }) {
  const th = useTheme();
  const x = useSharedValue(done ? 1 : 0);

  useEffect(() => {
    x.value = done
      ? withDelay(motion.duration.fast, withTiming(1, { duration: 240, easing: STANDARD }))
      : withTiming(0, { duration: 240, easing: STANDARD });
  }, [done, x]);

  const anim = useAnimatedStyle(() => ({ transform: [{ scaleX: x.value }] }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          left: 0,
          right: 0,
          top: "50%",
          height: 1,
          backgroundColor: th.c.ink,
          transformOrigin: "left",
        },
        anim,
        style,
      ]}
    />
  );
}
