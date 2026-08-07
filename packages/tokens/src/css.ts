/**
 * Generator CSS variable buat apps/web.
 * Dipanggil sekali saat build/dev untuk menghasilkan blok :root + dark mode.
 */
import { color, font, layout, motion, radius, type } from "./index.js";

function kebab(s: string): string {
  return s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

function colorVars(scheme: "light" | "dark"): string {
  return Object.entries(color[scheme])
    .map(([name, value]) => `  --c-${kebab(name)}: ${value};`)
    .join("\n");
}

export function generateCss(): string {
  const typeVars = Object.entries(type)
    .flatMap(([name, t]) => [
      `  --t-${kebab(name)}-size: ${t.size}px;`,
      `  --t-${kebab(name)}-leading: ${t.leading}px;`,
      `  --t-${kebab(name)}-weight: ${t.weight};`,
      `  --t-${kebab(name)}-tracking: ${t.tracking}em;`,
    ])
    .join("\n");

  return `/* Dihasilkan dari @kaitask/tokens — jangan diedit manual. */
:root {
${colorVars("light")}

  --font-display: ${font.display};
  --font-sans: ${font.sans};
  --font-mono: ${font.mono};

${typeVars}

  --radius-sm: ${radius.sm}px;
  --radius-md: ${radius.md}px;
  --radius-lg: ${radius.lg}px;

  --max-content: ${layout.maxContentWidth}px;
  --border-width: ${layout.borderWidth}px;

  --ease-standard: ${motion.easing.standard};
  --ease-enter: ${motion.easing.enter};
  --dur-fast: ${motion.duration.fast}ms;
  --dur-normal: ${motion.duration.normal}ms;
  --dur-slow: ${motion.duration.slow}ms;
}

:root[data-theme="dark"] {
${colorVars("dark")}
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
${colorVars("dark")}
  }
}

@media (prefers-reduced-motion: reduce) {
  :root {
    --dur-fast: 0ms;
    --dur-normal: 0ms;
    --dur-slow: 0ms;
  }
}
`;
}
