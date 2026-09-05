/**
 * Suara → teks, buat kolom chat.
 *
 * Ini pasangan paling pas di seluruh proyek: kontrak parser-nya SATU KALIMAT
 * bahasa Indonesia masuk, dan itu persis yang dikeluarin speech-to-text. Gak
 * ada yang perlu diterjemahin di tengah.
 *
 * ATURAN YANG GAK BOLEH DILANGGAR: hasil transkripsi mendarat di kolom ketik
 * sebagai teks yang MASIH BISA DIEDIT — dia gak pernah kekirim sendiri.
 *
 * Alasannya sama persis kayak alasan parser-nya pakai kamus, bukan LLM
 * (§11.2): bikin task itu perubahan data, dan salah dengar yang langsung jadi
 * data adalah kegagalan senyap. Kelihatan di kolom ketik dulu, salahnya jadi
 * kegagalan yang KELIHATAN — dan tinggal dibetulin sebelum Enter.
 */
import { useCallback, useState } from "react";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";

export interface Voice {
  listening: boolean;
  /** Teks sementara selagi ngomong — buat diperlihatkan, bukan disimpan. */
  partial: string;
  error: string | null;
  supported: boolean;
  start: () => Promise<void>;
  stop: () => void;
}

/**
 * @param onText dipanggil tiap transkripsi final. Pemanggilnya yang naruh ke
 *   kolom ketik — hook ini sengaja gak tau apa-apa soal ngirim pesan.
 */
export function useVoice(onText: (text: string) => void): Voice {
  const [listening, setListening] = useState(false);
  const [partial, setPartial] = useState("");
  const [error, setError] = useState<string | null>(null);

  useSpeechRecognitionEvent("start", () => {
    setListening(true);
    setError(null);
  });

  useSpeechRecognitionEvent("end", () => {
    setListening(false);
    setPartial("");
  });

  useSpeechRecognitionEvent("result", (e) => {
    const text = e.results[0]?.transcript ?? "";
    if (!text) return;
    if (e.isFinal) {
      setPartial("");
      onText(text);
    } else {
      setPartial(text);
    }
  });

  useSpeechRecognitionEvent("error", (e) => {
    setListening(false);
    setPartial("");
    setError(pesan(e.error));
  });

  const start = useCallback(async () => {
    setError(null);

    const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!perm.granted) {
      setError("Izin mikrofon belum dikasih.");
      return;
    }

    ExpoSpeechRecognitionModule.start({
      // Kalimatnya bahasa Indonesia — ini yang bikin parser-nya nyambung.
      lang: "id-ID",
      // Teks sementara diperlihatkan biar kerasa hidup; yang dipakai cuma final.
      interimResults: true,
      // Satu kalimat, lalu berhenti sendiri. Bukan dikte panjang.
      continuous: false,
      maxAlternatives: 1,
      /**
       * Kata-kata yang jadi kunci parser tapi jarang di kamus umum. Tanpa ini
       * "jadwalin" gampang kedengeran "jadwal in" dan waktunya gak kebaca.
       */
      contextualStrings: [
        "jadwalin", "tambahin", "ingetin", "selesaiin", "kelarin",
        "batalin", "hapus", "pindahin", "tampilin", "besok", "lusa",
      ],
    });
  }, []);

  const stop = useCallback(() => {
    ExpoSpeechRecognitionModule.stop();
  }, []);

  return {
    listening,
    partial,
    error,
    // Modulnya selalu kepasang di build ini; yang bisa gak ada itu mesin
    // pengenalnya di HP — dan itu ketauannya lewat event error, bukan di awal.
    supported: true,
    start,
    stop,
  };
}

/** Pesan error dalam bahasa manusia, bukan kode. */
function pesan(code: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Izin mikrofon belum dikasih.";
    case "no-speech":
      return "Gak kedengeran apa-apa.";
    case "network":
      return "Butuh internet buat ngenalin suara.";
    case "language-not-supported":
      return "HP ini belum punya bahasa Indonesia buat suara.";
    case "aborted":
      return "";
    default:
      return "Gagal ngenalin suara.";
  }
}
