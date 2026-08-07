import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { configureStorage } from "@hakaitask/core/store";
import { webStorage } from "./lib/storage.js";
import App from "./App.js";
import "./styles.css";

// Wajib sebelum store kesentuh — core sengaja gak tahu apa-apa soal browser.
// Ini juga yang memicu rehydrate; App nunggu flag `hydrated` sebelum render isi.
void configureStorage(webStorage);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
