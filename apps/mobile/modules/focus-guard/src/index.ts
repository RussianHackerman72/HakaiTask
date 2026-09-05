/**
 * focus-guard — penjaga sesi fokus (PLAN.md §6.3 + §5.3).
 *
 * Android-only. Tiga izin yang dipakai semuanya izin KHUSUS: gak bisa diminta
 * lewat dialog biasa, user harus nyalain sendiri di Setelan. Makanya API-nya
 * dipisah jadi "cek" dan "buka setelan" — layar onboarding-nya butuh dua-duanya
 * biar bisa nunjukin keadaan sekarang, bukan cuma ngelempar orang ke Setelan.
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
  /** Paket yang diblokir selama sesi. */
  blocked: string[];
  /** Judul di notifikasi ongoing — biasanya judul task-nya. */
  title: string;
  /** Kapan sesi ini mestinya kelar, buat teks notifikasi. Epoch ms. */
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
};

declare class FocusGuardModuleType extends NativeModule<Events> {
  // ── izin (semuanya khusus, harus lewat Setelan) ──────────────────────────
  hasUsageStatsPermission(): boolean;
  openUsageStatsSettings(): void;

  isAccessibilityEnabled(): boolean;
  openAccessibilitySettings(): void;

  hasDndPermission(): boolean;
  openDndSettings(): void;

  // ── daftar app buat pemilih blocklist ────────────────────────────────────
  /** App yang punya launcher icon doang — sisanya cuma bikin daftar panjang. */
  listInstalledApps(): InstalledApp[];

  // ── sesi ─────────────────────────────────────────────────────────────────
  startGuard(options: StartGuardOptions): void;
  stopGuard(): void;
  isGuarding(): boolean;
}

export const FocusGuard = requireNativeModule<FocusGuardModuleType>("FocusGuard");
