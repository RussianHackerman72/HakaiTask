package expo.modules.focusguard

import android.accessibilityservice.AccessibilityService
import android.content.Intent
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

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    if (event?.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return
    if (!GuardState.isGuarding()) return

    val pkg = event.packageName?.toString() ?: return
    // Jangan pernah ngehalangin diri sendiri atau layar penghalangnya.
    if (pkg == packageName) return

    val now = System.currentTimeMillis()
    if (!GuardState.shouldBlock(pkg, now)) return

    GuardState.onBlocked?.invoke(pkg, now)

    startActivity(
      Intent(this, BlockedActivity::class.java).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
        putExtra(BlockedActivity.EXTRA_PACKAGE, pkg)
      },
    )
  }

  override fun onInterrupt() = Unit
}
