package expo.modules.focusguard

import android.accessibilityservice.AccessibilityService
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.telecom.TelecomManager
import android.view.accessibility.AccessibilityEvent

/**
 * Satu-satunya tugasnya: tau app apa yang lagi di depan.
 *
 * Sengaja gak minta `canRetrieveWindowContent` dan cuma dengerin
 * TYPE_WINDOW_STATE_CHANGED — isi layar gak pernah dibaca. Yang dipakai cuma
 * `event.packageName`.
 *
 * Kenapa AccessibilityService dan bukan polling UsageStats? Polling tiap detik
 * dari layanan latar depan itu boros baterai DAN telat: user sempat lihat
 * beranda Instagram beberapa detik sebelum kehalang, dan beberapa detik itu
 * persis momen yang bikin dia lupa lagi ngapain.
 */
class BlockerAccessibilityService : AccessibilityService() {

  private val handler = Handler(Looper.getMainLooper())

  /** Paket yang lagi di depan waktu hitungan tenggang mulai jalan. */
  @Volatile
  private var awayPkg: String? = null
  private var pendingAway: Runnable? = null

  /**
   * App yang TIDAK pernah dianggap gangguan di mode ketat.
   *
   * Daftar ini bagian paling berbahaya dari fitur ini. Salah isi, sesi fokus
   * berubah jadi HP yang gak bisa dipakai — dan yang paling parah, gak bisa
   * dimatiin lagi karena Setelan-nya sendiri ikut kehalang.
   *
   * Jadi isinya dibaca dari SISTEM, bukan ditebak:
   *
   *   telepon   nomor satu, gak bisa ditawar. Sesi fokus gak boleh bikin
   *             orang gagal ngangkat telepon.
   *   setelan   pintu keluar. Kalau ini kehalang, mode ketatnya jadi jebakan.
   *   papan ketik  dia naik di atas app lain, bukan tujuan kepergian.
   *   diri sendiri termasuk layar penghalangnya.
   *
   * Peluncur (beranda) SENGAJA gak masuk daftar: di situlah orang mulai
   * nyari-nyari pengalih perhatian. Yang bikin itu tetap nyaman bukan
   * pengecualian, tapi tenggang waktunya — ngelirik jam gak sampai 15 detik.
   */
  private val exempt: Set<String> by lazy {
    val out = mutableSetOf(packageName)

    (getSystemService(Context.TELECOM_SERVICE) as? TelecomManager)
      ?.defaultDialerPackage
      ?.let(out::add)

    packageManager
      .resolveActivity(Intent(Settings.ACTION_SETTINGS), 0)
      ?.activityInfo
      ?.packageName
      ?.let(out::add)

    Settings.Secure
      .getString(contentResolver, Settings.Secure.DEFAULT_INPUT_METHOD)
      ?.substringBefore('/')
      ?.takeIf { it.isNotEmpty() }
      ?.let(out::add)

    out
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    if (event?.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return
    if (!GuardState.isGuarding()) return

    val pkg = event.packageName?.toString() ?: return

    /**
     * SystemUI itu lapisan di ATAS app yang lagi kebuka — laci notifikasi,
     * quick settings, volume. Narik laci bukan "pergi", jadi jangan mulai
     * hitungan baru; tapi juga jangan batalin yang lagi jalan, soalnya orang
     * yang lagi di app lain terus narik laci ya masih di luar.
     */
    if (pkg == SYSTEM_UI) return

    // Balik ke app sendiri (termasuk layar penghalang) → gak ada gangguan.
    if (pkg == packageName) {
      batalAway()
      return
    }

    val now = System.currentTimeMillis()

    // Daftar blokir tetap jalan seperti biasa, lepas dari mode ketat, dan dia
    // yang menang: langsung dihalang tanpa tenggang.
    if (GuardState.isListed(pkg)) {
      batalAway()
      if (GuardState.shouldBlock(pkg, now)) halangi(pkg, now)
      return
    }

    // `shouldBlock` juga yang nge-reset hitungan percobaan pas app lain naik.
    GuardState.shouldBlock(pkg, now)

    if (GuardState.strict && pkg !in exempt) mulaiAway(pkg)
  }

  /**
   * Mulai hitungan tenggang. Yang dicatat paket TERAKHIR, bukan yang pertama:
   * lompat dari Instagram ke TikTok dalam 5 detik itu tetap satu kali pergi,
   * dan yang mestinya disebut TikTok — di situ dia berhenti.
   */
  private fun mulaiAway(pkg: String) {
    awayPkg = pkg
    if (pendingAway != null) return

    val r = Runnable {
      pendingAway = null
      val target = awayPkg ?: return@Runnable
      if (!GuardState.isGuarding() || !GuardState.strict) return@Runnable
      halangi(target, System.currentTimeMillis())
    }
    pendingAway = r
    handler.postDelayed(r, GuardState.graceMs)
  }

  private fun batalAway() {
    pendingAway?.let(handler::removeCallbacks)
    pendingAway = null
    awayPkg = null
  }

  private fun halangi(pkg: String, now: Long) {
    GuardState.onBlocked?.invoke(pkg, now)
    startActivity(
      Intent(this, BlockedActivity::class.java).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
        putExtra(BlockedActivity.EXTRA_PACKAGE, pkg)
      },
    )
  }

  /** Sesi bisa disudahi pas kita lagi nunggu — jangan tinggalin timer nyangkut. */
  override fun onUnbind(intent: Intent?): Boolean {
    batalAway()
    return super.onUnbind(intent)
  }

  override fun onInterrupt() = Unit

  private companion object {
    const val SYSTEM_UI = "com.android.systemui"
  }
}
