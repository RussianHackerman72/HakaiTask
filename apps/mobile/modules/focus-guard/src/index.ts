/**
 * focus-guard — penjaga sesi fokus (PLAN.md §6.3 + §5.3).
 *
 * Android-only. Dua izin yang dipakai dua-duanya izin KHUSUS: gak bisa diminta
 * lewat dialog biasa, user harus nyalain sendiri di Setelan. Makanya API-nya
 * dipisah jadi "cek" dan "buka setelan" — layar onboarding-nya butuh dua-duanya
 * biar bisa nunjukin keadaan sekarang, bukan cuma ngelempar orang ke Setelan.
 *
 * Dulu ada izin ketiga, PACKAGE_USAGE_STATS. Dia dibuang: gak pernah kepakai
 * (penghitung gangguan jalan lewat AccessibilityService), tapi tetep nakut-nakutin
 * dan tetep butuh satu langkah onboarding.
 *
 * SEMUANYA opsional. Timer fokus tetap jalan penuh tanpa satu izin pun; yang
 * ilang cuma pemblokirannya. Itu disengaja — fitur yang maksa izin di depan
 * bakal ditolak, lalu fitur intinya ikut gak kepakai.
 */
import { NativeModule, requireNativeModule } from "expo";

export interface InstalledApp {
  packageName: string;
  label: string;
}

export interface StartGuardOptions {
  /** Paket yang diblokir selama sesi. Boleh kosong — layanannya tetap jalan. */
  blocked: string[];
  /** Judul di notifikasi ongoing — biasanya judul task-nya. */
  title: string;
  /** Buat deep-link balik ke layar sesi dari notifikasi & layar penghalang. */
  taskId?: string;
  /** Kapan sesi ini mestinya kelar. Epoch ms; null buat stopwatch. */
  endsAt: number | null;
  /** Nyalain Do Not Disturb selama sesi. */
  dnd: boolean;
}

export interface BlockedAttemptEvent {
  packageName: string;
  /** Epoch ms. */
  at: number;
}

type Events = {
  /**
   * Tiap kali app yang diblokir dicoba dibuka.
   *
   * Ini yang bikin §6.3 jadi lebih jujur daripada rencananya: tombol
   * "terganggu" itu manual karena dulu gak ada cara ngukur. Sekarang tiap
   * percobaan buka app kecatat sendiri — "datanya jauh lebih jujur daripada
   * cuma total waktu", lewat jalan yang lebih baik.
   */
  onBlockedAttempt: (e: BlockedAttemptEvent) => void;

  /**
   * Tombol Jeda / Selesai di notifikasi ongoing.
   *
   * Sesi fokus yang harus dibuka app-nya dulu buat disudahi itu ngundang
   * mampir ke app lain di jalan — persis yang lagi dicegah.
   */
  onGuardAction: (e: { action: "pause" | "stop" }) => void;
};

declare class FocusGuardModuleType extends NativeModule<Events> {
  // ── izin (semuanya khusus, harus lewat Setelan) ──────────────────────────
  isAccessibilityEnabled(): boolean;
  openAccessibilitySettings(): void;

  hasDndPermission(): boolean;
  openDndSettings(): void;

  /**
   * Halaman info app — jalan keluar buat "Restricted settings" di Android 13+,
   * yang bikin tombol aksesibilitas abu-abu buat app yang dipasang di luar Play.
   */
  openAppDetailsSettings(): void;

  // ── daftar app buat pemilih blocklist ────────────────────────────────────
  /** App yang punya launcher icon doang — sisanya cuma bikin daftar panjang. */
  listInstalledApps(): InstalledApp[];

  // ── sesi ─────────────────────────────────────────────────────────────────
  startGuard(options: StartGuardOptions): void;
  stopGuard(): void;
  isGuarding(): boolean;
}

export const FocusGuard = requireNativeModule<FocusGuardModuleType>("FocusGuard");
