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
        text = JUDUL
        setTextColor(Color.parseColor("#F7F7F5"))
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 28f)
        gravity = Gravity.CENTER
      },
    )

    root.addView(
      TextView(this).apply {
        text = subJudul()
        setTextColor(Color.parseColor("#A8A8AD"))
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
        gravity = Gravity.CENTER
        setPadding(0, dp(12), 0, dp(28))
      },
    )

    root.addView(
      Button(this).apply {
        text = "Oke, balik"
        setOnClickListener { balikKeSesi() }
      },
    )

    setContentView(root)
  }

  /**
   * Baris kedua gunanya ngingetin lagi ngerjain APA. Kalau sesinya gak
   * nempel ke task mana pun, judulnya jatuh ke teks bawaan yang sama persis
   * kayak baris pertama — dan layarnya jadi keliatan rusak, bukan tenang.
   * Jadi judul yang gak nambah informasi diganti kalimat penenang biasa.
   */
  private fun subJudul(): String {
    val judul = FocusGuardService.currentTitle?.trim()
    val kosong = judul.isNullOrEmpty() ||
      judul.trimEnd('.').equals(JUDUL.trimEnd('.'), ignoreCase = true)
    return if (kosong) "Balik lagi habis sesi ini." else judul!!
  }

  /** Tombol back sama persis kayak tombol di layar — dua-duanya balik ke sesi. */
  @Deprecated("Dipakai sengaja: perilakunya harus sama kayak tombol di layar.")
  override fun onBackPressed() {
    balikKeSesi()
  }

  /**
   * Balik ke HaKaiTask, BUKAN ke beranda.
   *
   * Dulu ke beranda, dengan alasan yang masih bener sejauh yang dia lihat:
   * balik ke app yang barusan diblokir bakal langsung kehalang lagi dan kerasa
   * kayak app-nya ngelawan. Tapi itu cuma nimbang DUA pilihan, dan yang
   * dipilih kebetulan yang paling gampang bocor — beranda itu kumpulan ikon
   * semua pengalih perhatian lain. Orang yang kehalang buka Instagram lalu
   * didorong ke beranda cuma butuh satu ketukan buat nemu TikTok.
   *
   * Pilihan ketiga: balik ke layar sesinya. Bukan app yang diblokir, bukan
   * beranda — tempat yang ngingetin lagi ngerjain apa.
   */
  private fun balikKeSesi() {
    val id = FocusGuardService.currentTaskId
    val intent = if (!id.isNullOrEmpty()) {
      android.content.Intent(
        android.content.Intent.ACTION_VIEW,
        android.net.Uri.parse("hakaitask://focus/$id"),
      )
    } else {
      packageManager.getLaunchIntentForPackage(packageName)
    }

    // Kalau intent-nya gak kebentuk (launcher gak ketemu — mestinya gak
    // mungkin), JANGAN diem: mendarat di beranda masih lebih baik daripada
    // layar penghalang yang gak bisa ditutup.
    if (intent == null) {
      startActivity(
        android.content.Intent(android.content.Intent.ACTION_MAIN).apply {
          addCategory(android.content.Intent.CATEGORY_HOME)
          flags = android.content.Intent.FLAG_ACTIVITY_NEW_TASK
        },
      )
    } else {
      intent.addFlags(
        android.content.Intent.FLAG_ACTIVITY_NEW_TASK or
          android.content.Intent.FLAG_ACTIVITY_CLEAR_TOP,
      )
      startActivity(intent)
    }
    finish()
  }

  private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()

  companion object {
    const val EXTRA_PACKAGE = "blockedPackage"
    private const val JUDUL = "Lagi fokus."
    private const val MATCH = ViewGroup.LayoutParams.MATCH_PARENT
  }
}
