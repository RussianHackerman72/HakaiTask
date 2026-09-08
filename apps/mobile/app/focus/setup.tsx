/**
 * Jalan pintas setelan penjaga fokus, dari layar sesi.
 *
 * Isinya sekarang cuma `<FocusSettings />` — benda yang sama persis yang
 * dipakai layar Setelan. Rutenya dipertahankan karena TEMPATNYA beda: ini
 * dibuka di tengah mau mulai sesi, waktu orangnya baru sadar app-nya belum
 * ditahan. Nyuruh dia muter lewat Setelan di momen itu artinya sesinya gak
 * jadi mulai.
 *
 * Dulu seluruh isinya ada di sini. Dipindah pas layar Setelan dibikin —
 * dua salinan setelan izin bakal pelan-pelan beda, dan bedanya muncul di
 * tempat paling jelek: dinyalain di satu layar, masih kebaca "belum" di
 * layar satunya.
 */
import { ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "../../src/ui/Screen";
import { T } from "../../src/ui/T";
import { Pill } from "../../src/ui/Pill";
import { useTheme } from "../../src/theme";
import { FocusSettings } from "../../src/components/FocusSettings";

export default function FocusSetup() {
  const th = useTheme();
  const router = useRouter();

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingVertical: th.space[3], gap: th.space[4] }}>
        <T variant="h1" style={{ fontSize: 26 }}>
          Penjaga fokus
        </T>
        <T variant="bodySm" tone="ink70">
          Semua di bawah ini opsional. Timer tetap jalan tanpa satu pun — yang ilang cuma
          kemampuan nahan app pengalih perhatian.
        </T>

        <FocusSettings />

        <Pill label="Selesai" onPress={() => router.back()} />
      </ScrollView>
    </Screen>
  );
}
