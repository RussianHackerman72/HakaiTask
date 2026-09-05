/**
 * Titik masuk app.
 *
 * Handler widget WAJIB kedaftar di sini, bukan di dalam pohon React: Android
 * manggil dia di proses headless — pas layar utama nge-refresh widget, app-nya
 * sering gak jalan sama sekali. Kalau pendaftarannya nunggu React mount, widget
 * cuma keisi kalau kebetulan app-nya lagi kebuka.
 */
import { registerWidgetTaskHandler } from "react-native-android-widget";
import "expo-router/entry";
import { widgetTaskHandler } from "./src/widget/handler";

registerWidgetTaskHandler(widgetTaskHandler);
