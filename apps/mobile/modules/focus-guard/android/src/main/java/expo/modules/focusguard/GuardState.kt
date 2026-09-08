package expo.modules.focusguard

import android.app.NotificationManager
import android.content.Context
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Do Not Disturb, dipisah dari modul Expo.
 *
 * Keadaan sebelumnya harus dicatat di tempat yang GAK ikut mati bareng JS.
 * Kalau catatannya nempel di instance modul, tombol "Selesai" di notifikasi
 * yang dipencet waktu JS-nya udah mati bakal ninggalin DND nyala terus, dan
 * user gak punya petunjuk apa pun soal siapa yang nyalain.
 */
object Dnd {
  @Volatile
  private var prior: Int? = null

  fun on(ctx: Context) {
    val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (!nm.isNotificationPolicyAccessGranted) return
    // Dicatat sekali doang — start dua kali jangan nimpa catatan aslinya
    // sama keadaan yang udah kita ubah sendiri.
    if (prior == null) prior = nm.currentInterruptionFilter
    nm.setInterruptionFilter(NotificationManager.INTERRUPTION_FILTER_PRIORITY)
  }

  /** Balikin ke keadaan sebelum sesi. Diam aja kalau kita gak pernah nyalain. */
  fun off(ctx: Context) {
    val balik = prior ?: return
    val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (!nm.isNotificationPolicyAccessGranted) return
    prior = null
    nm.setInterruptionFilter(balik)
  }
}

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

  /**
   * Tombol di notifikasi (Jeda / Selesai) → JS.
   *
   * Lewat sini, bukan lewat broadcast: layanan sama modul Expo hidup di proses
   * yang sama, jadi callback statis udah cukup dan gak perlu nambah receiver
   * yang harus didaftarin di manifest.
   *
   * Kalau JS-nya lagi mati, ini null dan tombolnya cuma matiin layanan. Itu
   * keadaan yang bener: notifikasinya ilang, dan pas app dibuka lagi state
   * sesinya diturunin ulang dari jam sistem — gak ada hitungan yang perlu
   * "dilanjutin".
   */
  @Volatile
  var onAction: ((String) -> Unit)? = null

  /**
   * Mode ketat: yang dijaga bukan daftar app, tapi "lagi di luar HaKaiTask".
   *
   * Kenapa begini dan bukan "hitung tiap kali user keluar app": Android gak
   * ngasih kail yang bunyi SEBELUM orang pergi. `onPause`/`onStop` bunyinya
   * sesudah, dan tombol home emang sengaja gak bisa disadap — app yang bisa
   * nahan orang di dalamnya itu app yang gak bisa ditinggal.
   *
   * Jadi yang diamati KEADAAN, bukan kejadian: AccessibilityService udah tau
   * app apa yang lagi di depan, tinggal dibalik pertanyaannya dari "app ini
   * diblokir gak?" jadi "app ini HaKaiTask bukan?".
   *
   * Efek sampingnya bagus: satuannya jadi "lagi di app lain", bukan "keluar
   * dari HaKaiTask" — jadi layar mati, laci notifikasi, dan rotasi gak
   * kehitung apa-apa. Itu yang bikin angkanya gak balik kembung kayak bug
   * satu-buka-kehitung-dua dulu.
   */
  @Volatile
  var strict: Boolean = false

  /**
   * Berapa lama boleh di luar sebelum ditegur. INI inti desainnya.
   *
   * Kalau negurnya pas detik pertama app lain naik, ngintip notifikasi,
   * ngangkat telepon, atau ngecek jam di beranda semuanya kena tembok — dan
   * fitur yang negur pas orang lagi bener itu fitur yang dimatiin minggu
   * depan. Di bawah ambang ini gak ada yang ditampilin DAN gak ada yang
   * dihitung: keluar sebentar terus balik itu bukan gangguan.
   */
  @Volatile
  var graceMs: Long = 15_000L

  fun start(packages: Set<String>, strictMode: Boolean, grace: Long) {
    blocked = packages
    strict = strictMode
    graceMs = grace
    guarding.set(true)
  }

  fun stop() {
    guarding.set(false)
    blocked = emptySet()
    strict = false
    lastBlockAt = 0L
    lastBlockedPackage = null
  }

  fun isGuarding(): Boolean = guarding.get()

  /** Paket ini ada di daftar blokir? Dipakai biar mode ketat gak dobel kerja. */
  fun isListed(packageName: String): Boolean = blocked.contains(packageName)

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
