import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { buildGreeting, type Task } from "@hakaitask/core";
import { useKaiStore } from "@hakaitask/core/store";
import { SignIn, useAuth } from "./components/AuthGate.js";
import { CalendarView } from "./components/CalendarView.js";
import { CommandPalette, type Command } from "./components/CommandPalette.js";
import { DashboardQuickAdd } from "./components/DashboardQuickAdd.js";
import { DetailSheet } from "./components/DetailSheet.js";
import { EmptyState } from "./components/EmptyState.js";
import { FocusCard } from "./components/FocusCard.js";
import { Greeting } from "./components/Greeting.js";
import { Header } from "./components/Header.js";
import { QuickAdd } from "./components/QuickAdd.js";
import { buildEntries, UpcomingList } from "./components/UpcomingList.js";
import { useLenis, useNow } from "./lib/hooks.js";
import type { Page } from "./lib/pages.js";
import { useTheme } from "./lib/theme.js";
import { startSync } from "./lib/sync.js";
import { useBusyBlocks, useFocus, useTasks } from "./lib/tasks.js";

/** Transisi antar halaman — sengaja objek polos biar gak merambat ke anak. */
const PAGE_ANIM = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.18 },
} as const;

export default function App() {
  const auth = useAuth();

  if (auth.state === "loading") {
    return <div className="min-h-dvh bg-paper" aria-busy="true" />;
  }
  if (auth.state === "signed-out") return <SignIn />;

  return (
    <Dashboard
      userId={auth.userId}
      name={auth.name}
      sync={auth.state === "signed-in"}
      {...(auth.state === "signed-in" ? { onSignOut: auth.signOut } : {})}
    />
  );
}

function Dashboard({
  userId,
  name,
  sync,
  onSignOut,
}: {
  userId: string;
  name: string;
  sync: boolean;
  onSignOut?: () => void;
}) {
  const now = useNow();
  useLenis();
  const { toggle: toggleTheme } = useTheme();

  const hydrated = useKaiStore((s) => s.hydrated);
  const tasks = useTasks();
  const blocks = useBusyBlocks();

  const [page, setPage] = useState<Page>("dashboard");
  const [showAllUpcoming, setShowAllUpcoming] = useState(false);

  // Default 5 biar dashboard tetap ringkas; kalau dibuka, tampilkan semua.
  const focus = useFocus(now, showAllUpcoming ? 999 : 5);
  const allUpcoming = useFocus(now, 999).upcoming.length;
  const hiddenCount = Math.max(0, allUpcoming - focus.upcoming.length);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [quickAdd, setQuickAdd] = useState<{ open: boolean; initial: string }>({
    open: false,
    initial: "",
  });
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    if (!sync) return;
    return startSync(userId);
  }, [sync, userId]);

  // Task yang lagi kebuka diambil dari store, bukan disalin ke state — biar
  // sheet ikut ke-update kalau datanya berubah dari device lain.
  const openTask = useMemo<Task | null>(
    () => (openTaskId ? (tasks.find((t) => t.id === openTaskId) ?? null) : null),
    [openTaskId, tasks],
  );

  const entries = useMemo(
    () => buildEntries(focus.upcoming, blocks, now),
    [focus.upcoming, blocks, now],
  );

  const greeting = buildGreeting(name, focus, now);

  // Task yang diselesaikan hari ini — bedain "belum punya task" dari "udah kelar semua".
  const doneToday = useMemo(() => {
    const map = useKaiStore.getState().tasks;
    return Object.values(map).filter(
      (t) =>
        t.completedAt !== undefined &&
        new Date(t.completedAt).toDateString() === now.toDateString(),
    ).length;
  }, [now, tasks]);

  const openQuickAdd = useCallback(
    (initial = "") => setQuickAdd({ open: true, initial }),
    [],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable === true;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }
      if (!typing && (e.key === "n" || e.key === "+")) {
        e.preventDefault();
        openQuickAdd();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openQuickAdd]);

  const commands = useMemo<Command[]>(
    () => [
      { id: "add", label: "Tambah task", hint: "n", run: () => openQuickAdd() },
      {
        id: "nav",
        label: page === "dashboard" ? "Buka kalender" : "Buka dashboard",
        run: () => setPage((p) => (p === "dashboard" ? "calendar" : "dashboard")),
      },
      { id: "theme", label: "Ganti mode terang/gelap", run: toggleTheme },
      ...(onSignOut ? [{ id: "signout", label: "Keluar", run: onSignOut }] : []),
    ],
    [openQuickAdd, toggleTheme, onSignOut, page],
  );

  // Sebelum store selesai rehydrate, jangan render apa pun: kalau dirender
  // duluan, dashboard sempat kelihatan kosong lalu isinya "meledak" masuk.
  if (!hydrated) return <div className="min-h-dvh bg-paper" aria-busy="true" />;

  return (
    <div className="min-h-dvh bg-paper">
      <main className="mx-auto w-full max-w-[var(--max-content)] px-6 pb-32 pt-8">
        <Header
          now={now}
          page={page}
          onNavigate={setPage}
          {...(onSignOut ? { onSignOut } : {})}
        />

        {/*
          Nilai animasinya ditulis eksplisit, BUKAN label variant. Label itu
          merambat ke semua motion descendant (kartu, baris list), jadi exit-nya
          nunggu mereka semua kelar — dan kalau salah satu gak pernah selesai,
          AnimatePresence nyangkut nahan halaman lama sementara nav & FAB udah
          pindah. Objek biasa gak merambat, jadi aman.
        */}
        <AnimatePresence mode="wait">
          {page === "dashboard" ? (
            <motion.div key="dashboard" {...PAGE_ANIM}>
              <div className="mt-10">
                <Greeting salam={greeting.salam} baris2={greeting.baris2} />
              </div>

              <div className="mt-8 space-y-6">
                <DashboardQuickAdd now={now} userId={userId} />

                {focus.focus ? (
                  <FocusCard
                    task={focus.focus}
                    now={now}
                    onOpen={() => setOpenTaskId(focus.focus!.id)}
                  />
                ) : (
                  <EmptyState
                    kind={doneToday > 0 ? "all-done" : "fresh"}
                    doneToday={doneToday}
                    onAdd={() => openQuickAdd()}
                  />
                )}

                <UpcomingList
                  entries={entries}
                  now={now}
                  onOpen={(task) => setOpenTaskId(task.id)}
                  hiddenCount={hiddenCount}
                  expanded={showAllUpcoming}
                  onToggleExpand={() => setShowAllUpcoming((v) => !v)}
                />
              </div>
            </motion.div>
          ) : (
            <motion.div key="calendar" {...PAGE_ANIM} className="mt-10">
              <CalendarView
                now={now}
                tasks={tasks}
                blocks={blocks}
                userId={userId}
                onOpenTask={(task) => setOpenTaskId(task.id)}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <DetailSheet task={openTask} now={now} onClose={() => setOpenTaskId(null)} />

      <QuickAdd
        open={quickAdd.open}
        now={now}
        userId={userId}
        initialValue={quickAdd.initial}
        onClose={() => setQuickAdd({ open: false, initial: "" })}
      />

      <CommandPalette
        open={paletteOpen}
        tasks={tasks}
        now={now}
        commands={commands}
        onClose={() => setPaletteOpen(false)}
        onOpenTask={(task) => setOpenTaskId(task.id)}
        onQuickAdd={(initial) => openQuickAdd(initial)}
      />
    </div>
  );
}
