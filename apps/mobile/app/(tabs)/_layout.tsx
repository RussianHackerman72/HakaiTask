/**
 * Tiga halaman yang sama kayak web: Chat · Dashboard · Kalender.
 * Di web ini pil di header; di HP tab bawah — lebih kejangkau jempol.
 */
import { Tabs } from "expo-router";
import { useTheme } from "../../src/theme";

export default function TabsLayout() {
  const th = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: th.c.ink,
        tabBarInactiveTintColor: th.c.ink40,
        tabBarStyle: {
          backgroundColor: th.c.surface,
          borderTopColor: th.c.line,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: { ...th.t.meta, fontSize: 12 },
        // Ikonnya belum ada; labelnya udah cukup jelas dan gak nambah dependensi.
        tabBarIconStyle: { display: "none" },
        tabBarItemStyle: { paddingVertical: 8 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Chat" }} />
      <Tabs.Screen name="dashboard" options={{ title: "Dashboard" }} />
    </Tabs>
  );
}
