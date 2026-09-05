package expo.modules.focusguard

import java.util.concurrent.atomic.AtomicBoolean

/**
 * Keadaan sesi yang dipakai bareng tiga proses yang gak saling kenal:
 * modul Expo (JS), layanan latar depan, dan AccessibilityService.
 *
 * Sengaja `object` statis, bukan dilempar-lempar lewat Intent: AccessibilityService
 * dijalanin dan dimatiin oleh SISTEM, bukan oleh kita. Dia bisa hidup duluan
 * sebelum sesi mulai, dan bisa tetap hidup sesudah sesi selesai — jadi dia butuh
 * satu tempat buat nanya "lagi ada sesi gak, dan apa aja yang diblokir?".
 */
object GuardState {
  private val guarding = AtomicBoolean(false)

  @Volatile
  private var blocked: Set<String> = emptySet()

  /**
   * Kapan terakhir satu paket dihalang. Dipakai bareng `lastBlockedPackage`
   * buat mutusin apakah sebuah event itu percobaan BARU atau masih sisa
   * percobaan yang sama.
   */
  @Volatile
  private var lastBlockAt: Long = 0L

  @Volatile
  private var lastBlockedPackage: String? = null

  /** Diisi modul Expo biar percobaan yang kehalang bisa dikirim ke JS. */
  @Volatile
  var onBlocked: ((String, Long) -> Unit)? = null

  fun start(packages: Set<String>) {
    blocked = packages
    guarding.set(true)
  }

  fun stop() {
    guarding.set(false)
    blocked = emptySet()
    lastBlockAt = 0L
    lastBlockedPackage = null
  }

  fun isGuarding(): Boolean = guarding.get()

  /**
   * Balikin true kalau paket ini harus dihalang SEKARANG.
   *
   * Satuannya PERCOBAAN, bukan event. Sekali buka app bisa ngeluarin beberapa
   * TYPE_WINDOW_STATE_CHANGED: app-nya naik, layar penghalang naik, app-nya
   * sempat balik sebentar pas task-nya beres-beres. Diukur di emulator jarak
   * antar-event itu bisa 2 detik lebih — jadi peredam waktu doang gak cukup,
   * dan satu kali buka Chrome kehitung dua gangguan.
   *
   * Aturannya: selama belum ada app LAIN yang ke depan, itu masih percobaan
   * yang sama. Begitu user pindah ke app yang gak diblokir (termasuk beranda,
   * yang mana ke situ juga tombol di layar penghalang nganterin), hitungannya
   * direset dan kunjungan berikutnya dihitung baru.
   *
   * Peredam waktunya disimpan sebagai jaring pengaman buat kasus event-nya
   * nyusul jauh belakangan tanpa ada app lain di antaranya. Peredamnya
   * per-paket, bukan global: kalau global, user yang kehalang di Instagram
   * lalu langsung nyoba TikTok bakal lolos gara-gara masih dalam jendela.
   */
  fun shouldBlock(packageName: String, now: Long): Boolean {
    if (!guarding.get()) return false

    if (!blocked.contains(packageName)) {
      // App lain ke depan — percobaan sebelumnya dianggap kelar.
      lastBlockedPackage = null
      return false
    }

    val percobaanYangSama =
      packageName == lastBlockedPackage && now - lastBlockAt < SAME_VISIT_MS
    if (percobaanYangSama) return false

    lastBlockAt = now
    lastBlockedPackage = packageName
    return true
  }

  private const val SAME_VISIT_MS = 5000L
}
