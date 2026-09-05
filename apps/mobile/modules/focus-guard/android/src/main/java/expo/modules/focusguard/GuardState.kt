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
   * Jeda singkat sesudah satu blokiran biar layar penghalangnya gak dipanggil
   * berkali-kali buat satu percobaan yang sama — satu kali buka app bisa
   * ngeluarin beberapa event window.
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
   * Peredamnya per-paket, bukan global: kalau global, user yang kehalang di
   * Instagram lalu langsung nyoba TikTok bakal lolos gara-gara masih dalam
   * jendela peredam.
   */
  fun shouldBlock(packageName: String, now: Long): Boolean {
    if (!guarding.get()) return false
    if (!blocked.contains(packageName)) return false

    val sama = packageName == lastBlockedPackage
    if (sama && now - lastBlockAt < DEBOUNCE_MS) return false

    lastBlockAt = now
    lastBlockedPackage = packageName
    return true
  }

  private const val DEBOUNCE_MS = 1200L
}
