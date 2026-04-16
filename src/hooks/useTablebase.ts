"use client";

import { useState, useEffect, useRef } from "react";

export interface TablebaseResult {
  category: "win" | "draw" | "loss" | null;
  dtz: number | null;
  bestMove: string | null;
  loading: boolean;
}

function countPieces(fen: string): number {
  const board = fen.split(" ")[0];
  let count = 0;
  for (const ch of board) {
    if (ch !== "/" && !/\d/.test(ch)) {
      count++;
    }
  }
  return count;
}

const EMPTY: TablebaseResult = { category: null, dtz: null, bestMove: null, loading: false };

export function useTablebase(fen: string, enabled: boolean): TablebaseResult {
  const [result, setResult] = useState<TablebaseResult>(EMPTY);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Cleanup previous request and timer
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }

    // Early exit: disabled or too many pieces
    if (!enabled || !fen) {
      setResult(EMPTY);
      return;
    }

    const pieces = countPieces(fen);
    if (pieces > 7) {
      setResult(EMPTY);
      return;
    }

    // Debounce 200ms to avoid rapid-fire requests during arrow-key navigation
    setResult((prev) => ({ ...prev, loading: true }));

    timerRef.current = setTimeout(() => {
      const controller = new AbortController();
      abortRef.current = controller;

      fetch(`/api/tablebase?fen=${encodeURIComponent(fen)}`, {
        signal: controller.signal,
      })
        .then((res) => {
          if (!res.ok) {
            // 400 errors (too many pieces, invalid FEN) — just clear
            setResult(EMPTY);
            return;
          }
          return res.json();
        })
        .then((data) => {
          if (data && !controller.signal.aborted) {
            setResult({
              category: data.category ?? null,
              dtz: data.dtz ?? null,
              bestMove: data.bestMove ?? null,
              loading: false,
            });
          }
        })
        .catch((err) => {
          if (err?.name !== "AbortError") {
            setResult(EMPTY);
          }
        });
    }, 200);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
    };
  }, [fen, enabled]);

  return result;
}
