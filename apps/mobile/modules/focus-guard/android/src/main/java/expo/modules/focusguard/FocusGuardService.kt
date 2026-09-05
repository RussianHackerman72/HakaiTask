package expo.modules.focusguard

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
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
    when (intent?.action) {
      ACTION_STOP -> {
        stopSelf()
        return START_NOT_STICKY
      }
    }

    currentTitle = intent?.getStringExtra(EXTRA_TITLE)
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

  private fun build(title: String?, endsAt: Long): android.app.Notification {
    val open = packageManager.getLaunchIntentForPackage(packageName)?.apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }
    val pending = open?.let {
      PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE)
    }

    val body = when {
      endsAt > 0 -> {
        val menit = ((endsAt - System.currentTimeMillis()) / 60_000).coerceAtLeast(0)
        "Sisa sekitar $menit menit."
      }
      else -> "Sesi lagi jalan."
    }

    return NotificationCompat.Builder(this, CHANNEL)
      .setContentTitle(title ?: "Lagi fokus")
      .setContentText(body)
      .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
      .setOngoing(true)
      .setSilent(true)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .also { b -> pending?.let { b.setContentIntent(it) } }
      .build()
  }

  companion object {
    /** Dibaca `BlockedActivity` biar layar penghalangnya bisa nyebut task-nya. */
    @Volatile
    var currentTitle: String? = null

    const val EXTRA_TITLE = "title"
    const val EXTRA_ENDS_AT = "endsAt"
    const val ACTION_STOP = "expo.modules.focusguard.STOP"

    private const val CHANNEL = "focus_guard_session"
    private const val NOTIF_ID = 4201
  }
}
