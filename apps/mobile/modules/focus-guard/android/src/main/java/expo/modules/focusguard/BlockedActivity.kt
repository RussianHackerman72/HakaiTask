package expo.modules.focusguard

import android.app.Activity
import android.graphics.Color
import android.os.Bundle
import android.util.TypedValue
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

/**
 * Layar penghalang. Ditulis pakai View biasa, bukan React Native — dia muncul
 * di saat app-nya sering belum jalan, dan nunggu bundle JS naik cuma bikin
 * layar putih beberapa detik. Yang justru cukup lama buat kebablasan.
 *
 * Nadanya sengaja BUKAN teguran. §6.4 udah nyebut soal itu: app yang bikin
 * ngerasa bersalah bakal dihindari, dan app to-do yang dihindari gak ada
 * gunanya. Jadi ini cuma ngingetin lagi ngerjain apa, plus jalan keluar yang
 * jujur — sesi bisa disudahi kapan aja lewat app.
 */
class BlockedActivity : Activity() {

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      setBackgroundColor(Color.parseColor("#0E0E10"))
      setPadding(dp(32), dp(32), dp(32), dp(32))
      layoutParams = ViewGroup.LayoutParams(MATCH, MATCH)
    }

    root.addView(
      TextView(this).apply {
        text = "Lagi fokus."
        setTextColor(Color.parseColor("#F7F7F5"))
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 28f)
        gravity = Gravity.CENTER
      },
    )

    root.addView(
      TextView(this).apply {
        text = FocusGuardService.currentTitle ?: "Balik lagi habis sesi ini."
        setTextColor(Color.parseColor("#A8A8AD"))
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
        gravity = Gravity.CENTER
        setPadding(0, dp(12), 0, dp(28))
      },
    )

    root.addView(
      Button(this).apply {
        text = "Oke, balik"
        // Tombolnya nutup layar ini DAN balik ke home — bukan balik ke app yang
        // tadi diblokir, soalnya itu bakal langsung kehalang lagi dan kerasa
        // kayak app-nya ngelawan, bukan nolong.
        setOnClickListener { goHome() }
      },
    )

    setContentView(root)
  }

  /** Tombol back juga ke home, bukan balik ke app yang diblokir. */
  @Deprecated("Dipakai sengaja: perilakunya harus sama kayak tombol di layar.")
  override fun onBackPressed() {
    goHome()
  }

  private fun goHome() {
    startActivity(
      android.content.Intent(android.content.Intent.ACTION_MAIN).apply {
        addCategory(android.content.Intent.CATEGORY_HOME)
        flags = android.content.Intent.FLAG_ACTIVITY_NEW_TASK
      },
    )
    finish()
  }

  private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()

  companion object {
    const val EXTRA_PACKAGE = "blockedPackage"
    private const val MATCH = ViewGroup.LayoutParams.MATCH_PARENT
  }
}
