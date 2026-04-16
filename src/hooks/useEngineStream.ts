"use client";

import { useEffect, useRef, useState } from "react";
import { Chess } from "chess.js";

export interface EngineLine {
  rank: number;             // 1 = best
  scoreCp: number | null;   // centipawns from side-to-move's POV
  mate: number | null;      // signed plies to mate, side-to-move POV
  uci: string[];            // PV in UCI
  san: string[];            // PV in SAN
}

export interface EngineStreamState {
  status: "idle" | "streaming" | "done" | "error";
  depth: number;
  finalDepth: number | null;
  lines: EngineLine[];
  error: string | null;
}

const INITIAL: EngineStreamState = {
  status: "idle",
  depth: 0,
  finalDepth: null,
  lines: [],
  error: null,
};

interface DepthEvent {
  depth: number;
  lines: Array<{
    rank: number;
    scoreCp: number | null;
    mate: number | null;
    pv: string[];
  }>;
}

function uciPvToSan(fen: string, pv: string[], maxPlies = 12): string[] {
  const chess = new Chess(fen);
  const out: string[] = [];
  for (let i = 0; i < pv.length && i < maxPlies; i++) {
    const uci = pv[i];
    if (!uci || uci.length < 4) break;
    const move = {
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.length > 4 ? uci.slice(4, 5) : undefined,
    };
    try {
      const result = chess.move(move);
      if (!result) break;
      out.push(result.san);
    } catch {
      break;
    }
  }
  return out;
}

export function useEngineStream(
  fen: string,
  options?: { enabled?: boolean; maxDepth?: number; multiPv?: number }
): EngineStreamState {
  const enabled = options?.enabled ?? true;
  const maxDepth = options?.maxDepth ?? 22;
  const multiPv = options?.multiPv ?? 8;

  const [state, setState] = useState<EngineStreamState>(INITIAL);
  const esRef = useRef<EventSource | null>(null);
  const seqRef = useRef(0);

  useEffect(() => {
    // Close any prior stream immediately so rapid navigation aborts upstream engines
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    if (!enabled || !fen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState(INITIAL);
      return;
    }

    const mySeq = ++seqRef.current;
    setState({ status: "streaming", depth: 0, finalDepth: null, lines: [], error: null });

    let es: EventSource | null = null;

    // Debounce opening the EventSource so arrow-key spam doesn't spawn engines per keystroke
    const debounceId = setTimeout(() => {
      if (mySeq !== seqRef.current) return;

      const url = `/api/stockfish/stream?fen=${encodeURIComponent(fen)}&maxDepth=${maxDepth}&multiPv=${multiPv}`;
      es = new EventSource(url);
      esRef.current = es;

      es.addEventListener("depth", (e: MessageEvent) => {
        if (mySeq !== seqRef.current) return;
        try {
          const data = JSON.parse(e.data) as DepthEvent;
          const lines: EngineLine[] = data.lines.map(l => ({
            rank: l.rank,
            scoreCp: l.scoreCp,
            mate: l.mate,
            uci: l.pv,
            san: uciPvToSan(fen, l.pv),
          }));
          setState(prev => ({
            ...prev,
            status: "streaming",
            depth: data.depth,
            lines,
          }));
        } catch (err) {
          console.error("[useEngineStream] depth parse error:", err);
        }
      });

      es.addEventListener("done", (e: MessageEvent) => {
        if (mySeq !== seqRef.current) return;
        try {
          const data = JSON.parse(e.data) as { finalDepth: number };
          setState(prev => ({ ...prev, status: "done", finalDepth: data.finalDepth }));
        } catch {
          setState(prev => ({ ...prev, status: "done" }));
        }
        es?.close();
        if (esRef.current === es) esRef.current = null;
      });

      es.addEventListener("error", (e: MessageEvent | Event) => {
        if (mySeq !== seqRef.current) return;
        // Browser auto-reconnects on network errors — kill it explicitly
        const message = "data" in e && typeof e.data === "string"
          ? (() => { try { return (JSON.parse(e.data) as { message?: string }).message ?? "stream error"; } catch { return "stream error"; } })()
          : "stream connection lost";
        setState(prev => ({ ...prev, status: "error", error: message }));
        es?.close();
        if (esRef.current === es) esRef.current = null;
      });
    }, 150);

    return () => {
      clearTimeout(debounceId);
      es?.close();
      if (esRef.current === es) esRef.current = null;
    };
  }, [fen, enabled, maxDepth, multiPv]);

  return state;
}
