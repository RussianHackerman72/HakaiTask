/**
 * Sync di mobile — worker-nya sendiri dipakai bareng web (packages/app),
 * di sini cuma dua hal yang beda: dari mana status online dibaca, dan kapan
 * harus narik ulang.
 */
import { useEffect } from "react";
import { AppState } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { startSync } from "@hakaitask/app/sync";
import { supabase } from "./supabase";

/**
 * `isInternetReachable` sengaja dipakai, bukan cuma `isConnected`: kekunci ke
 * WiFi hotel yang belum di-login itu "connected" tapi gak bisa apa-apa, dan
 * outbox bakal nabrak terus tanpa alasan yang kelihatan.
 */
function watchConnectivity(onChange: (online: boolean) => void): () => void {
  return NetInfo.addEventListener((s) =>
    onChange(Boolean(s.isConnected && s.isInternetReachable !== false)),
  );
}

export function useSync(userId: string | null): void {
  useEffect(() => {
    if (!userId || !supabase) return;

    const handle = startSync({ client: supabase, userId, watchConnectivity });

    /**
     * Pas app di-background, WebSocket realtime-nya mati diem-diem dan gak
     * ngasih tau siapa-siapa. Jadi tiap balik ke depan, tarik ulang pakai
     * watermark — itu sumber kebenarannya; realtime cuma pemangkas latensi.
     */
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void handle.kick();
    });

    return () => {
      sub.remove();
      handle.stop();
    };
  }, [userId]);
}
