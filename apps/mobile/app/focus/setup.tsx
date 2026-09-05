/**
 * Setelan penjaga fokus — izin + daftar app yang diblokir.
 *
 * Tiga izin di sini semuanya izin KHUSUS: gak ada dialog "Izinkan?", user harus
 * nyalain sendiri di Setelan sistem. Jadi layar ini nunjukin KEADAAN SEKARANG
 * tiap izin dan alasannya dalam satu kalimat — bukan cuma tombol yang
 * ngelempar orang ke Setelan tanpa penjelasan.
 *
 * Semuanya OPSIONAL. Timer fokus jalan penuh tanpa satu izin pun; yang ilang
 * cuma pemblokirannya. Fitur yang maksa izin di depan bakal ditolak, dan fitur
 * intinya ikut gak kepakai.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppState, ScrollView, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { FocusGuard, type InstalledApp } from "../../modules/focus-guard";
import { Screen } from "../../src/ui/Screen";
import { T } from "../../src/ui/T";
import { Card } from "../../src/ui/Card";
import { Pill } from "../../src/ui/Pill";
import { Chip } from "../../src/ui/Chip";
import { Tappable } from "../../src/ui/Pressable";
import { Checkbox } from "../../src/ui/Checkbox";
import { useTheme } from "../../src/theme";
import { useBlocklist, useGuardSettings } from "../../src/guard";

export default function FocusSetup() {
  const th = useTheme();
  const router = useRouter();
  const { blocked, toggle } = useBlocklist();
  const { dnd, setDnd } = useGuardSettings();

  const [perms, setPerms] = useState({ usage: false, a11y: false, dnd: false });
  const [apps, setApps] = useState<InstalledApp[]>([]);
  const [filter, setFilter] = useState("");

  /**
   * Dicek ulang tiap app balik ke depan — izinnya dinyalain di SETELAN, jadi
   * pas user balik ke sini keadaannya udah beda. Tanpa ini layarnya bakal
   * bilang "belum" padahal barusan dinyalain.
   */
  const refresh = useCallback(() => {
    setPerms({
      usage: FocusGuard.hasUsageStatsPermission(),
      a11y: FocusGuard.isAccessibilityEnabled(),
      dnd: FocusGuard.hasDndPermission(),
    });
  }, []);

  useEffect(() => {
    refresh();
    try {
      setApps(FocusGuard.listInstalledApps());
    } catch {
      setApps([]);
    }
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = q ? apps.filter((a) => a.label.toLowerCase().includes(q)) : apps;
    // Yang udah dipilih ditaruh di atas — kalau enggak, user harus nyari lagi
    // buat mastiin pilihannya kesimpen.
    return [...list].sort(
      (a, b) => Number(blocked.includes(b.packageName)) - Number(blocked.includes(a.packageName)),
    );
  }, [apps, filter, blocked]);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingVertical: th.space[3], gap: th.space[4] }}>
        <T variant="h1" style={{ fontSize: 26 }}>Penjaga fokus</T>
        <T variant="bodySm" tone="ink70">
          Semua di bawah ini opsional. Timer tetap jalan tanpa satu pun — yang ilang
          cuma kemampuan nahan app pengalih perhatian.
        </T>

        <Perm
          label="Lihat app yang lagi kebuka"
          why="Dipakai buat tau kapan app yang kamu blokir kebuka. Isi layar gak dibaca."
          granted={perms.a11y}
          onPress={() => FocusGuard.openAccessibilitySettings()}
        />

        <Perm
          label="Akses statistik pemakaian"
          why="Buat nyatet berapa kali kamu kepancing buka app itu selama sesi."
          granted={perms.usage}
          onPress={() => FocusGuard.openUsageStatsSettings()}
        />

        <Perm
          label="Mode jangan ganggu"
          why="Biar notifikasi lain diem selama sesi fokus."
          granted={perms.dnd}
          onPress={() => FocusGuard.openDndSettings()}
        />

        {perms.dnd && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: th.space[2] }}>
            <Checkbox
              checked={dnd}
              onChange={() => setDnd(!dnd)}
              label="Nyalain jangan ganggu tiap sesi"
              size={20}
            />
            <T variant="bodySm">Nyalain jangan ganggu tiap sesi</T>
          </View>
        )}

        <View style={{ gap: th.space[2] }}>
          <T variant="h2" style={{ fontSize: 15 }}>
            App yang ditahan {blocked.length > 0 ? `(${blocked.length})` : ""}
          </T>

          <TextInput
            value={filter}
            onChangeText={setFilter}
            placeholder="Cari app…"
            placeholderTextColor={th.c.ink40}
            style={{
              backgroundColor: th.c.surface,
              borderRadius: th.radius.full,
              paddingHorizontal: 18,
              paddingVertical: 10,
              color: th.c.ink,
              ...th.t.bodySm,
            }}
          />

          {apps.length === 0 ? (
            <T variant="bodySm" tone="ink40">Daftar app-nya belum kebaca.</T>
          ) : (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {shown.slice(0, 40).map((a) => (
                <Chip
                  key={a.packageName}
                  label={a.label}
                  active={blocked.includes(a.packageName)}
                  onPress={() => toggle(a.packageName)}
                />
              ))}
            </View>
          )}
        </View>

        <Pill label="Selesai" onPress={() => router.back()} />
      </ScrollView>
    </Screen>
  );
}

function Perm({
  label,
  why,
  granted,
  onPress,
}: {
  label: string;
  why: string;
  granted: boolean;
  onPress: () => void;
}) {
  const th = useTheme();
  return (
    <Card style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: th.space[2] }}>
        <T variant="h2" style={{ fontSize: 15, flex: 1 }}>{label}</T>
        <T variant="num" tone={granted ? "ink40" : "accent"}>
          {granted ? "aktif" : "belum"}
        </T>
      </View>
      <T variant="bodySm" tone="ink70">{why}</T>
      {!granted && (
        <Tappable onPress={onPress} style={{ alignSelf: "flex-start", paddingHorizontal: 0 }}>
          <T variant="num" style={{ color: th.c.ink }}>Buka setelan →</T>
        </Tappable>
      )}
    </Card>
  );
}
