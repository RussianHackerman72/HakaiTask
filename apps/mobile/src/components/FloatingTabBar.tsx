/**
 * Tab bar ngambang — pil yang lepas dari dasar layar.
 *
 * Yang bikin bentuk ini gampang jadi jelek ada tiga, dan tiga-tiganya diurus
 * di sini:
 *
 *   1. INDIKATORNYA yang geser, bukan warnanya yang loncat. Pil yang cuma
 *      ganti warna teks kerasa kayak tiga tombol; pil yang punya satu bentuk
 *      geser kerasa kayak satu benda. Posisinya shared value, dianimasiin
 *      pakai `spring.standard` — pegas yang sama kayak Switch dan Tappable,
 *      jadi seluruh app punya satu rasa.
 *
 *   2. NGUMPET pas papan ketik naik. Tanpa ini, dia duduk persis di atas
 *      papan ketik dan nutupin kolom ketik chat — layar yang paling sering
 *      dipakai di app ini.
 *
 *   3. Duduk DI ATAS garis geser sistem. Di HP bergestur, tombol yang nempel
 *      di dasar layar bikin setengah ketukannya kebaca sebagai geser pulang.
 *
 * Lebar tiap tab diukur dari lebar pil dibagi jumlah tab, bukan dari
 * `onLayout` tiap item: `onLayout` baru bunyi sesudah frame pertama, jadi
 * indikatornya kelihatan loncat dari nol pas app baru dibuka.
 */
import { useEffect, useRef, useState } from "react";
import { Keyboard, Platform, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme";
import { Tappable } from "../ui/Pressable";
import { T } from "../ui/T";

/**
 * Bentuk props yang DIPAKAI, ditulis sendiri.
 *
 * `BottomTabBarProps` aslinya ada, tapi cuma di dalam React Navigation yang
 * DIBUNDEL expo-router — dia gak diekspor dari `expo-router`, dan
 * `@react-navigation/bottom-tabs` bukan dependensi kita (expo-router 57
 * pakai `standard-navigation`). Satu-satunya jalan impor tipe aslinya itu
 * nyolok ke `expo-router/build/react-navigation/...`, yaitu isi folder build
 * yang bisa pindah tiap versi.
 *
 * Jadi yang ditulis di sini cuma irisan yang beneran dipakai. Irisannya
 * kebetulan bagian paling stabil dari kontrak tab bar — bentuknya gak berubah
 * dari React Navigation 5 sampai 7. Ongkosnya jujur: kalau kontraknya berubah,
 * ketauannya pas jalan, bukan pas kompilasi. Ditukar sama gak nyandar ke
 * lintasan berkas build orang lain.
 */
type TabBarProps = {
  state: { index: number; routes: { key: string; name: string }[] };
  descriptors: Record<string, { options: { title?: string } }>;
  navigation: {
    emit: (e: { type: "tabPress"; target: string; canPreventDefault: true }) => {
      defaultPrevented: boolean;
    };
    navigate: (name: string) => void;
  };
  insets: { top: number; right: number; bottom: number; left: number };
};

const TINGGI = 52;
const PADDING = 4;

/**
 * Ruang yang harus DISISAIN layar tab di bagian bawahnya.
 *
 * Tab bar-nya ngambang di atas isi layar, jadi apa pun yang dipatok di dasar
 * layar — kolom ketik chat sama chip sarannya, misalnya — bakal ketutup kalau
 * gak dikasih jarak. Angkanya ditaruh di sini, bukan diketik ulang di tiap
 * layar, supaya tinggi pil dan jarak yang disisain gak bisa beda.
 *
 * Dipakai lewat `useTabBarSpace()` karena butuh inset bawah perangkatnya.
 */
/**
 * Papan ketik lagi naik?
 *
 * Dipisah jadi hook karena DUA hal butuh jawabannya: pil-nya (buat ngumpet)
 * dan `useTabBarSpace()` (buat ngelepas jarak yang disisain). Dulu cuma
 * pil-nya yang tau, dan jaraknya angka mati — jadi pas papan ketik naik
 * pil-nya ilang tapi jaraknya tetep nongkrong, nyisain lubang kosong setinggi
 * tab bar persis di atas kolom ketik. Dua fitur yang masing-masing bener, yang
 * gak saling ngasih tau.
 */
export function useKeyboardUp(): boolean {
  const [ketik, setKetik] = useState(false);
  useEffect(() => {
    const naik = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const turun = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const a = Keyboard.addListener(naik, () => setKetik(true));
    const b = Keyboard.addListener(turun, () => setKetik(false));
    return () => {
      a.remove();
      b.remove();
    };
  }, []);
  return ketik;
}

export function useTabBarSpace(): number {
  const th = useTheme();
  const insets = useSafeAreaInsets();
  // Pil-nya dilepas total pas papan ketik naik, jadi gak ada yang perlu
  // dihindarin — jaraknya ikut nol.
  return useKeyboardUp() ? 0 : TINGGI + insets.bottom + th.space[3];
}

export function FloatingTabBar({ state, descriptors, navigation, insets }: TabBarProps) {
  const th = useTheme();

  const [lebar, setLebar] = useState(0);
  const jumlah = state.routes.length;
  const lebarTab = lebar > 0 ? (lebar - PADDING * 2) / jumlah : 0;

  const x = useSharedValue(0);
  /**
   * Lompatan PERTAMA sesudah lebarnya keukur gak dianimasiin. Itu bukan
   * perpindahan tab — itu indikatornya baru tau di mana tempatnya. Dianimasiin
   * malah bikin dia selalu keliatan ngesot dari tab pertama tiap layar ini
   * dipasang ulang.
   */
  const udahDitaruh = useRef(false);
  useEffect(() => {
    if (lebarTab <= 0) return;
    const tujuan = state.index * lebarTab;
    if (udahDitaruh.current) {
      x.value = withSpring(tujuan, th.spring.standard);
    } else {
      x.value = tujuan;
      udahDitaruh.current = true;
    }
  }, [state.index, lebarTab, x, th.spring.standard]);

  const ketik = useKeyboardUp();

  const muncul = useSharedValue(1);
  useEffect(() => {
    muncul.value = withTiming(ketik ? 0 : 1, { duration: 150 });
  }, [ketik, muncul]);

  const indikator = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const bungkus = useAnimatedStyle(() => ({
    opacity: muncul.value,
    // Digeser turun sekalian, biar gak cuma memudar di tempat.
    transform: [{ translateY: (1 - muncul.value) * 24 }],
  }));

  /**
   * SENGAJA gak di-unmount pas papan ketik naik.
   *
   * Dulu barisnya `if (ketik && muncul.value === 0) return null`, dan itu dua
   * masalah sekaligus. Pertama, `muncul.value` dibaca waktu render — nilai
   * shared value gak bikin render ulang, jadi syaratnya cuma kebaca "kebetulan
   * udah nol pas render", gak pernah pasti. Kedua, unmount-nya nge-reset `x`
   * balik ke 0, jadi pas muncul lagi indikatornya mulai dari tab pertama lalu
   * ngesot ke tab yang bener — dan itu kebaca persis kayak tab bar yang nunjuk
   * layar yang salah.
   *
   * Alasan aslinya — pil tembus pandang yang masih nangkep sentuhan — udah
   * dijaga `pointerEvents` di bawah. Jadi unmount-nya gak beli apa-apa.
   */

  return (
    <Animated.View
      pointerEvents={ketik ? "none" : "auto"}
      style={[
        {
          position: "absolute",
          left: th.space[4],
          right: th.space[4],
          bottom: insets.bottom + th.space[3],
        },
        bungkus,
      ]}
    >
      <View
        onLayout={(e) => setLebar(e.nativeEvent.layout.width)}
        style={{
          flexDirection: "row",
          height: TINGGI,
          padding: PADDING,
          borderRadius: th.radius.full,
          backgroundColor: th.c.surface,
        }}
      >
        {lebarTab > 0 && (
          <Animated.View
            style={[
              {
                position: "absolute",
                top: PADDING,
                left: PADDING,
                width: lebarTab,
                height: TINGGI - PADDING * 2,
                borderRadius: th.radius.full,
                backgroundColor: th.c.ink,
              },
              indikator,
            ]}
          />
        )}

        {state.routes.map((route, i) => {
          const { options } = descriptors[route.key]!;
          const label = options.title ?? route.name;
          const aktif = state.index === i;

          return (
            <Tappable
              key={route.key}
              haptic={false}
              accessibilityLabel={label}
              onPress={() => {
                const event = navigation.emit({
                  type: "tabPress",
                  target: route.key,
                  canPreventDefault: true,
                });
                // Ketuk tab yang lagi kebuka = gulir balik ke atas, itu urusan
                // navigator. Jangan navigate lagi, itu bikin layarnya kedip.
                if (!aktif && !event.defaultPrevented) navigation.navigate(route.name);
              }}
              style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
            >
              <T variant="meta" tone={aktif ? "surface" : "ink40"}>
                {label}
              </T>
            </Tappable>
          );
        })}
      </View>
    </Animated.View>
  );
}
