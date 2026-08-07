import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { createJiti } from "jiti";

const GENERATED = fileURLToPath(new URL("./src/tokens.generated.css", import.meta.url));

/**
 * Token design ditulis jadi CSS variable sebelum Vite mulai (§7), supaya
 * `packages/tokens` tetap satu-satunya sumber kebenaran dan file CSS-nya
 * gak pernah diedit tangan.
 *
 * Ditulis ke file beneran, bukan modul virtual: `@import` di dalam CSS
 * diselesaikan oleh resolver Tailwind sendiri, yang gak kenal virtual module.
 *
 * jiti dipakai karena Vite meng-externalize import bare di file config,
 * dan Node gak bisa langsung `import` sumber .ts dari workspace.
 */
async function writeTokensCss(): Promise<void> {
  const jiti = createJiti(import.meta.url);
  const { generateCss } = (await jiti.import("@hakaitask/tokens/css")) as {
    generateCss: () => string;
  };

  const next = generateCss();
  let current: string | null = null;
  try {
    current = readFileSync(GENERATED, "utf8");
  } catch {
    // belum ada — wajar di clone baru
  }
  // Nulis ulang tanpa perubahan bakal memicu HMR palsu tiap restart.
  if (current !== next) writeFileSync(GENERATED, next, "utf8");
}

export default defineConfig(async () => {
  await writeTokensCss();
  return {
    plugins: [tailwind(), react()],
    envDir: "../..",
    server: { port: 5173 },
  };
});
