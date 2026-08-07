import { useEffect, useRef, useState } from "react";
import Lenis from "lenis";
import { motion as tok } from "@hakaitask/tokens";

/**
 * Jam yang jalan. Nge-tick di detik ke-0 tiap menit, bukan tiap 60 detik dari
 * mount — biar tampilan jam gak pernah telat sampai satu menit.
 */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const d = new Date();
      setNow(d);
      timer = setTimeout(tick, 60_000 - (d.getSeconds() * 1000 + d.getMilliseconds()));
    };
    tick();
    return () => clearTimeout(timer);
  }, []);

  return now;
}

/** Smooth scroll Lenis (§7.4). Mati total kalau user minta reduced motion. */
export function useLenis(): void {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const lenis = new Lenis({
      lerp: tok.lenis.lerp,
      duration: tok.lenis.duration,
      smoothWheel: tok.lenis.smoothWheel,
    });

    let frame = 0;
    const raf = (time: number) => {
      lenis.raf(time);
      frame = requestAnimationFrame(raf);
    };
    frame = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(frame);
      lenis.destroy();
    };
  }, []);
}

/** Fokus otomatis + kembaliin fokus ke elemen sebelumnya saat ditutup. */
export function useAutoFocus<T extends HTMLElement>(active: boolean) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    if (!active) return;
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => previous?.focus?.();
  }, [active]);

  return ref;
}

/** Kunci scroll body selama overlay kebuka. */
export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [active]);
}

/** Tutup saat Escape ditekan. */
export function useEscape(active: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, onClose]);
}
