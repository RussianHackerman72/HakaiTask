package expo.modules.focusguard

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

/**
 * Layanan latar depan yang nemenin sesi fokus.
 *
 * Dua alasan dia ada, dan dua-duanya perlu:
 *
 *  1. Notifikasi ONGOING — §6.3 minta ini ("notifikasi ongoing, Android
 *     foreground-style"), dan dulu dianggap gak mungkin waktu rencananya masih
 *     Expo Go. Ini yang bikin timernya kelihatan pas layar dikunci.
 *  2. Bikin proses app-nya tetap hidup selama sesi. Tanpa itu Android bebas
 *     ngebunuh proses, dan `GuardState` — yang dibaca AccessibilityService —
 *     ikut hilang. Pemblokirannya bakal mati diam-diam di tengah sesi.
 */
class FocusGuardService : Service() {

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    /**
     * Dua tombol di laci. Urusan bersih-bersihnya dilakuin DI SINI, bukan cuma
     * dititip ke JS lewat `onAction`.
     *
     * Kalau prosesnya JS udah mati, `onAction` itu null — dan kalau
     * pembersihannya cuma lewat sana, `GuardState` bakal ketinggalan dalam
     * keadaan "lagi menjaga" tanpa layanan dan tanpa notifikasi. Efeknya:
     * AccessibilityService terus ngeblokir app selamanya, dan user gak punya
     * satu pun petunjuk kenapa HP-nya jadi begitu.
     *
     * `GuardState.stop()` dan `Dnd.off()` dua-duanya idempoten, jadi jalur JS
     * yang nyusul belakangan gak jadi masalah.
     */
    // Dikasih nilai bawaan "" biar tipenya String polos, bukan String? —
    // `onAction` minta String, dan smart-cast lewat `||` itu hal yang mending
    // gak usah dipertaruhkan di kode yang cuma bisa dikompilasi di EAS.
    val action = intent?.action ?: ""
    if (action == ACTION_STOP || action == ACTION_PAUSE) {
      GuardState.stop()
      Dnd.off(this)
      GuardState.onAction?.invoke(action)
      stopSelf()
      return START_NOT_STICKY
    }

    currentTitle = intent?.getStringExtra(EXTRA_TITLE)
    currentTaskId = intent?.getStringExtra(EXTRA_TASK_ID)
    val endsAt = intent?.getLongExtra(EXTRA_ENDS_AT, 0L) ?: 0L

    ensureChannel()
    val notif = build(currentTitle, endsAt)

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startForeground(NOTIF_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    } else {
      startForeground(NOTIF_ID, notif)
    }

    // START_STICKY: kalau sistem sempat ngebunuh prosesnya, layanannya
    // dihidupin lagi. Sesi fokus yang mati diam-diam lebih buruk daripada
    // notifikasi yang nongol sebentar lalu dibersihin pas stopGuard().
    return START_STICKY
  }

  override fun onDestroy() {
    currentTitle = null
    currentTaskId = null
    super.onDestroy()
  }

  private fun ensureChannel() {
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (nm.getNotificationChannel(CHANNEL) != null) return
    nm.createNotificationChannel(
      NotificationChannel(CHANNEL, "Sesi fokus", NotificationManager.IMPORTANCE_LOW).apply {
        // LOW + gak ada suara: dia nemenin, bukan ngagetin. Notifikasi ongoing
        // yang bunyi tiap muncul itu justru gangguan di tengah sesi fokus.
        setShowBadge(false)
        enableVibration(false)
      },
    )
  }

  /**
   * Ketuk notifikasi → mendarat di LAYAR SESINYA, bukan halaman depan.
   *
   * Deep link `hakaitask://focus/<id>` ditangani expo-router. Kalau sesinya
   * gak nempel ke task mana pun, jatuh ke intent launcher biasa.
   */
  private fun openIntent(): PendingIntent? {
    val id = currentTaskId
    val intent = if (!id.isNullOrEmpty()) {
      Intent(Intent.ACTION_VIEW, Uri.parse("hakaitask://focus/$id"))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    } else {
      packageManager.getLaunchIntentForPackage(packageName)?.apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      }
    } ?: return null

    return PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_IMMUTABLE)
  }

  private fun actionIntent(action: String, code: Int): PendingIntent {
    val intent = Intent(this, FocusGuardService::class.java).setAction(action)
    return PendingIntent.getService(this, code, intent, PendingIntent.FLAG_IMMUTABLE)
  }

  private fun build(title: String?, endsAt: Long): android.app.Notification {
    val b = NotificationCompat.Builder(this, CHANNEL)
      .setContentTitle(title ?: "Lagi fokus")
      .setSmallIcon(R.drawable.ic_focus_notif)
      .setOngoing(true)
      .setSilent(true)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setShowWhen(true)

    /**
     * Hitungannya dijalanin ANDROID, bukan kita.
     *
     * Dulu di sini teksnya dihitung sekali pas layanan mulai — "Sisa sekitar
     * 25 menit" — dan gak pernah dibangun ulang. Sejam kemudian dia masih
     * bilang 25 menit. Notifikasinya bukan cuma gak berguna, dia BOHONG, dan
     * satu-satunya angka yang ditampilin sepanjang sesi itu angka yang salah.
     *
     * `setUsesChronometer` bikin Android yang nggambar dan nge-tick sendiri:
     * nol kerjaan dari kita, nol wakelock, dan tetep bener walau prosesnya
     * ditidurin. Timer mundur buat sesi bertenggat, timer maju buat stopwatch.
     */
    if (endsAt > 0) {
      b.setUsesChronometer(true)
      b.setChronometerCountDown(true)
      b.setWhen(endsAt)
    } else {
      b.setUsesChronometer(true)
      b.setChronometerCountDown(false)
      b.setWhen(System.currentTimeMillis())
      b.setContentText("Sesi lagi jalan.")
    }

    openIntent()?.let { b.setContentIntent(it) }

    // Jeda & selesai langsung dari laci — sesi fokus yang harus dibuka
    // app-nya dulu buat disudahi itu ngundang buka app lain di jalan.
    b.addAction(0, "Jeda", actionIntent(ACTION_PAUSE, 1))
    b.addAction(0, "Selesai", actionIntent(ACTION_STOP, 2))

    return b.build()
  }

  companion object {
    /** Dibaca `BlockedActivity` biar layar penghalangnya bisa nyebut task-nya. */
    @Volatile
    var currentTitle: String? = null

    /** Dipakai buat deep-link balik ke layar sesinya, dari notifikasi & penghalang. */
    @Volatile
    var currentTaskId: String? = null

    const val EXTRA_TITLE = "title"
    const val EXTRA_TASK_ID = "taskId"
    const val EXTRA_ENDS_AT = "endsAt"
    const val ACTION_STOP = "expo.modules.focusguard.STOP"
    const val ACTION_PAUSE = "expo.modules.focusguard.PAUSE"

    private const val CHANNEL = "focus_guard_session"
    private const val NOTIF_ID = 4201
  }
}
