package expo.modules.focusguard

import android.app.AppOpsManager
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.os.Process
import android.provider.Settings
import android.text.TextUtils
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class StartGuardOptions : Record {
  @Field var blocked: List<String> = emptyList()
  @Field var title: String = "Lagi fokus"
  @Field var endsAt: Long? = null
  @Field var dnd: Boolean = false
}

/**
 * Jembatan JS ⇄ Android buat penjaga sesi fokus.
 *
 * Tiga izin yang dipakai semuanya izin KHUSUS — gak ada dialog runtime buat
 * mereka, user harus nyalain sendiri di Setelan. Makanya tiap izin punya
 * sepasang fungsi: satu buat NGECEK, satu buat MEMBUKA halaman setelannya.
 * Layar onboarding butuh dua-duanya biar bisa nunjukin keadaan sekarang,
 * bukan cuma ngelempar orang ke Setelan dan berharap.
 */
class FocusGuardModule : Module() {

  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "React context belum siap" }

  override fun definition() = ModuleDefinition {
    Name("FocusGuard")

    Events("onBlockedAttempt")

    OnCreate {
      GuardState.onBlocked = { pkg, at ->
        sendEvent("onBlockedAttempt", mapOf("packageName" to pkg, "at" to at))
      }
    }

    OnDestroy {
      GuardState.onBlocked = null
    }

    // ── izin ────────────────────────────────────────────────────────────────

    Function("hasUsageStatsPermission") {
      val ops = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
      val mode = ops.unsafeCheckOpNoThrow(
        AppOpsManager.OPSTR_GET_USAGE_STATS,
        Process.myUid(),
        context.packageName,
      )
      mode == AppOpsManager.MODE_ALLOWED
    }

    Function("openUsageStatsSettings") {
      openSettings(Settings.ACTION_USAGE_ACCESS_SETTINGS)
    }

    /**
     * Dibaca dari Settings.Secure, bukan dari status layanan kita sendiri:
     * user bisa matiin layanannya dari Setelan kapan aja, dan proses kita gak
     * dikasih tau. Satu-satunya sumber yang jujur ya daftar sistem.
     */
    Function("isAccessibilityEnabled") {
      val enabled = Settings.Secure.getString(
        context.contentResolver,
        Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES,
      ) ?: return@Function false

      val target = "${context.packageName}/${BlockerAccessibilityService::class.java.name}"
      val splitter = TextUtils.SimpleStringSplitter(':')
      splitter.setString(enabled)
      splitter.any { it.equals(target, ignoreCase = true) }
    }

    Function("openAccessibilitySettings") {
      openSettings(Settings.ACTION_ACCESSIBILITY_SETTINGS)
    }

    Function("hasDndPermission") {
      val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      nm.isNotificationPolicyAccessGranted
    }

    Function("openDndSettings") {
      openSettings(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS)
    }

    // ── daftar app ──────────────────────────────────────────────────────────

    /**
     * Cuma app yang punya ikon launcher. Tanpa saringan itu daftarnya ratusan
     * paket sistem, dan pemilih blocklist-nya jadi gak kepakai.
     */
    Function("listInstalledApps") {
      val pm = context.packageManager
      val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)

      pm.queryIntentActivities(intent, 0)
        .asSequence()
        .mapNotNull { it.activityInfo?.applicationInfo }
        .filter { it.packageName != context.packageName }
        .distinctBy { it.packageName }
        .map {
          mapOf(
            "packageName" to it.packageName,
            "label" to pm.getApplicationLabel(it).toString(),
          )
        }
        .sortedBy { it["label"]?.lowercase() }
        .toList()
    }

    // ── sesi ────────────────────────────────────────────────────────────────

    Function("startGuard") { options: StartGuardOptions ->
      GuardState.start(options.blocked.toSet())

      if (options.dnd) setDnd(true)

      val svc = Intent(context, FocusGuardService::class.java).apply {
        putExtra(FocusGuardService.EXTRA_TITLE, options.title)
        putExtra(FocusGuardService.EXTRA_ENDS_AT, options.endsAt ?: 0L)
      }
      context.startForegroundService(svc)
    }

    Function("stopGuard") {
      GuardState.stop()
      setDnd(false)
      context.stopService(Intent(context, FocusGuardService::class.java))
    }

    Function("isGuarding") { GuardState.isGuarding() }
  }

  private fun openSettings(action: String) {
    context.startActivity(
      Intent(action).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
    )
  }

  /**
   * DND dinyalain cuma kalau izinnya ada. Gak dikasih izin bukan alasan buat
   * gagal — sesinya tetap jalan, cuma tanpa senyap.
   */
  private fun setDnd(on: Boolean) {
    val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (!nm.isNotificationPolicyAccessGranted) return
    nm.setInterruptionFilter(
      if (on) NotificationManager.INTERRUPTION_FILTER_PRIORITY
      else NotificationManager.INTERRUPTION_FILTER_ALL,
    )
  }
}
