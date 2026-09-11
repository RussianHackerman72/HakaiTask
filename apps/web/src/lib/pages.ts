/**
 * Halaman aplikasi — PLAN-CHAT.md §2.
 *
 * `home` (chat) jadi halaman pembuka. Dashboard turun jadi alat: todo +
 * jadwal, tanpa sapaan. Sapaan sekarang cuma hidup di chat.
 */
/**
 * `archive` ada di sini tapi SENGAJA gak punya tab di navbar. Dia tempat yang
 * dikunjungi sesekali, bukan yang ditongkrongin — sejajar sama empat yang lain
 * bikin dia keliatan sepenting itu. Jalannya lewat command palette. Di mobile
 * alasan yang sama naruh dia di balik Setelan.
 */
export type Page = "home" | "dashboard" | "calendar" | "kanban" | "archive";
