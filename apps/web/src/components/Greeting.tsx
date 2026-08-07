import { motion, useReducedMotion } from "framer-motion";
import { enterTransition, stagger } from "../lib/motion.js";

/** Sapaan: blur-in + stagger per kata (§7.4). */
function SplitWords({ text, delay = 0 }: { text: string; delay?: number }) {
  const reduced = useReducedMotion();
  const words = text.split(" ");

  if (reduced) return <>{text}</>;

  return (
    <>
      {words.map((word, i) => (
        <motion.span
          key={`${word}-${i}`}
          className="inline-block whitespace-pre"
          initial={{ opacity: 0, y: 10, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ ...enterTransition, delay: delay + i * stagger }}
        >
          {word}
          {i < words.length - 1 ? " " : ""}
        </motion.span>
      ))}
    </>
  );
}

export function Greeting({ salam, baris2 }: { salam: string; baris2: string }) {
  return (
    <div>
      <h1 className="t-display text-ink">
        <SplitWords text={salam} />
      </h1>
      <p className="mt-2 text-[17px] font-medium leading-6 text-ink70">
        <SplitWords text={baris2} delay={0.12} />
      </p>
    </div>
  );
}
