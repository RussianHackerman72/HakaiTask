/**
 * Tiga halaman yang sama kayak web: Chat · Dashboard · Kalender.
 * Di web ini pil di header; di HP tab bawah — lebih kejangkau jempol.
 *
 * Tab bar-nya ngambang (`FloatingTabBar`), bukan bawaan yang nempel di dasar
 * layar. `tabBarStyle: display none` bikin yang bawaan gak ke-render sama
 * sekali; kalau cuma dikasih `tabBar` custom tanpa itu, di beberapa versi
 * ruang kosong setinggi tab bar lama tetap kepesan di bawah layar.
 */
import { Tabs } from "expo-router";
import { FloatingTabBar } from "../../src/components/FloatingTabBar";

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: "none" },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Chat" }} />
      <Tabs.Screen name="dashboard" options={{ title: "Dashboard" }} />
      <Tabs.Screen name="calendar" options={{ title: "Kalender" }} />
    </Tabs>
  );
}
