package expo.modules.focusguard

import android.app.AlarmManager
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.text.TextUtils
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class StartGuardOptions : Record {
  @Field var blocked: List<String> = emptyList()
  @Field var title: String = "Lagi fokus"
  /** Buat deep-link balik ke layar sesinya dari notifikasi & layar penghalang. */
  @Field var taskId: String? = null
  @Field var endsAt: Long? = null
  @Field var dnd: Boolean = false
  /** Mode ketat: apa pun yang bukan HaKaiTask kehitung, bukan cuma blocklist. */
  @Field var strict: Boolean = false
  /** Tenggang sebelum ditegur, detik. Di bawah ini gak dihitung & gak ditampilin. */
  @Field var graceSec: Int = 15
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

    Events("onBlockedAttempt", "onGuardAction")

    OnCreate {
      GuardState.onBlocked = { pkg, at ->
        sendEvent("onBlockedAttempt", mapOf("packageName" to pkg, "at" to at))
      }
      GuardState.onAction = { action ->
        sendEvent(
          "onGuardAction",
          mapOf("action" to if (action == FocusGuardService.ACTION_PAUSE) "pause" else "stop"),
        )
      }
    }

    OnDestroy {
      GuardState.onBlocked = null
      GuardState.onAction = null
    }

    // ── izin ────────────────────────────────────────────────────────────────

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

    /**
     * Halaman info app-nya sendiri — jalan keluar buat "Restricted settings".
     *
     * Android 13+ ngunci tombol aksesibilitas buat app yang dipasang di luar
     * Play (persis kasus kita), dan tombolnya kelihatan ABU-ABU tanpa
     * penjelasan apa pun. Yang bisa buka: App info → ⋮ → "Allow restricted
     * settings". Gak ada API buat ngecek keadaan itu, apalagi buat nembusnya
     * — dan emang gak boleh ada, itu justru langkah yang dipakai malware.
     * Yang bisa kita kasih cuma jalan pintas ke halaman yang bener.
     */
    Function("openAppDetailsSettings") {
      context.startActivity(
        Intent(
          Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
          Uri.fromParts("package", context.packageName, null),
        ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
      )
    }

    Function("hasDndPermission") {
      val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      nm.isNotificationPolicyAccessGranted
    }

    Function("openDndSettings") {
      openSettings(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS)
    }

    // ── alarm presisi ────────────────────────────────────────────────────────

    /**
     * Beda sama izin lain di berkas ini: yang ini bukan buat penjaga fokus,
     * tapi buat pengingat. Numpang di modul ini karena expo-notifications gak
     * ngebuka canScheduleExactAlarms() ke JS sama sekali, dan bikin modul native
     * baru cuma buat satu panggilan ongkosnya lebih mahal daripada nebeng.
     *
     * False artinya pengingat TELAT, bukan hilang — expo-notifications turun ke
     * alarm non-presisi tanpa bilang apa-apa. Gagal diam-diam kayak gitu yang
     * bikin ini pantes dilaporin ke layar setelan.
     *
     * Di Android 13+ selalu true: USE_EXACT_ALARM gak bisa dicabut. Yang bisa
     * false cuma 12/12L, dan itu pun setelah user nyabut sendiri — lihat
     * catatan SCHEDULE_EXACT_ALARM di AndroidManifest.xml.
     */
    Function("canScheduleExactAlarms") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
        true
      } else {
        val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        am.canScheduleExactAlarms()
      }
    }

    /**
     * Halaman "Alarm & pengingat". Cuma ada gunanya di API 31/32, karena cuma
     * di situ app kita kedaftar di sana — dari 33 ke atas USE_EXACT_ALARM gak
     * muncul sebagai saklar yang bisa dimatiin.
     */
    /**
     * Doze. Kalau app-nya gak dikecualiin, Android boleh nunda alarm sama kerja
     * latar pas HP nganggur lama. Jalannya beda dari alarm presisi, gejalanya
     * sama persis: pengingat telat tanpa satu pun error.
     */
    Function("isIgnoringBatteryOptimizations") {
      val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
      pm.isIgnoringBatteryOptimizations(context.packageName)
    }

    /**
     * Sengaja BUKAN ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS. Dialog
     * sekali-ketuk itu nuntut izin REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, dan
     * izin itu termasuk yang paling gampang bikin Play Protect curiga — persis
     * ongkos yang dulu bikin QUERY_ALL_PACKAGES sama PACKAGE_USAGE_STATS
     * dibuang dari sini. Daftar sistem gak butuh izin apa-apa; user yang milih
     * app-nya sendiri. Satu ketukan lebih panjang, nol izin baru.
     */
    Function("openBatterySettings") {
      openSettings(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
    }

    Function("openExactAlarmSettings") {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        context.startActivity(
          Intent(
            Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
            Uri.fromParts("package", context.packageName, null),
          ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
      }
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
      // Tenggang dikunci minimal 5 detik. Di bawah itu praktis gak ada
      // tenggangnya, dan tiap kali ngintip notifikasi kena tembok.
      GuardState.start(
        options.blocked.toSet(),
        options.strict,
        options.graceSec.coerceAtLeast(5).toLong() * 1000L,
      )

      if (options.dnd) setDnd(true)

      val svc = Intent(context, FocusGuardService::class.java).apply {
        putExtra(FocusGuardService.EXTRA_TITLE, options.title)
        putExtra(FocusGuardService.EXTRA_TASK_ID, options.taskId)
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
   *
   * Logikanya ada di `Dnd`, bukan di sini: catatan keadaan sebelumnya harus
   * hidup lebih lama daripada instance modul ini, biar tombol di notifikasi
   * tetap bisa balikin DND walau JS-nya udah mati.
   */
  private fun setDnd(on: Boolean) {
    if (on) Dnd.on(context) else Dnd.off(context)
  }
}
