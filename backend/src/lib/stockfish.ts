import { spawn, ChildProcess } from "child_process";

export interface EngineEval {
  bestMove: string;
  eval: number; // centipawns from white's perspective
  mate: number | null; // mate in N
  depth: number;
  pv: string[]; // principal variation (best line)
  nodesSearched?: number;
  timeMs?: number;
}

export interface MultiLineEval {
  lines: EngineEval[];
}

const STOCKFISH_PATH = process.env.STOCKFISH_PATH ?? "stockfish";

export class StockfishEngine {
  private process: ChildProcess | null = null;
  private buffer = "";
  private streamBuffer = "";
  private isReady = false;
  public onStdoutLine?: (line: string) => void;

  async start(options?: { threads?: number; hashMb?: number }): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.process = spawn(STOCKFISH_PATH, [], {
          stdio: ["pipe", "pipe", "pipe"],
        });

        if (!this.process) {
          reject(new Error("Failed to spawn Stockfish process"));
          return;
        }

        this.process.on("error", (err) => {
          reject(new Error(`Stockfish process error: ${err.message}`));
        });

        this.process.on("exit", (code) => {
          if (code !== 0) {
            console.error(`Stockfish exited with code ${code}`);
          }
          this.process = null;
          this.isReady = false;
        });

        this.process.stdout?.on("data", (data: Buffer) => {
          const text = data.toString();
          this.buffer += text;
          if (this.buffer.length > 2 * 1024 * 1024) {
            this.buffer = this.buffer.slice(-1024 * 1024);
          }
          if (this.onStdoutLine) {
            this.streamBuffer += text;
            let nlIdx: number;
            while ((nlIdx = this.streamBuffer.indexOf("\n")) >= 0) {
              const line = this.streamBuffer.slice(0, nlIdx).replace(/\r$/, "");
              this.streamBuffer = this.streamBuffer.slice(nlIdx + 1);
              if (line) {
                try { this.onStdoutLine(line); } catch (err) { console.error("onStdoutLine error:", err); }
              }
            }
          }
        });

        this.process.stderr?.on("data", (data: Buffer) => {
          console.error(`Stockfish stderr: ${data.toString()}`);
        });

        // Initialize engine
        const threads = options?.threads ?? parseInt(process.env.STOCKFISH_THREADS ?? "4", 10);
        const hashMb = options?.hashMb ?? parseInt(process.env.STOCKFISH_HASH_MB ?? "512", 10);

        this.send("uci");
        this.waitFor("uciok", 5000).then(() => {
          this.send(`setoption name Threads value ${threads}`);
          this.send(`setoption name Hash value ${hashMb}`);
          this.send("isready");
          return this.waitFor("readyok", 5000);
        }).then(() => {
          this.isReady = true;
          resolve();
        }).catch(reject);
      } catch (error) {
        reject(new Error(`Failed to start Stockfish: ${error}`));
      }
    });
  }

  async evaluate(
    fen: string,
    depth: number = 20,
    multiPv: number = 1,
    timeoutMs: number = 30000
  ): Promise<MultiLineEval> {
    if (!this.process) throw new Error("Engine not started");

    if (multiPv > 1) {
      this.send(`setoption name MultiPV value ${multiPv}`);
    }

    this.buffer = "";
    this.send(`position fen ${fen}`);
    this.send(`go depth ${depth}`);

    try {
      const output = await this.waitFor("bestmove", timeoutMs);
      const lines = this.parseOutput(output, multiPv);

      if (multiPv > 1) {
        this.send("setoption name MultiPV value 1");
      }

      return { lines };
    } catch (error) {
      throw new Error(`Evaluation timeout or error: ${error}`);
    }
  }

  async evaluatePosition(
    fen: string,
    depth: number = 20,
    timeoutMs: number = 30000
  ): Promise<EngineEval> {
    const result = await this.evaluate(fen, depth, 1, timeoutMs);
    return result.lines[0] || {
      bestMove: "",
      eval: 0,
      mate: null,
      depth: 0,
      pv: [],
    };
  }

  private parseOutput(output: string, _multiPv: number): EngineEval[] {
    const outputLines = output.split("\n");
    const evals = new Map<number, EngineEval>();

    for (const line of outputLines) {
      if (!line.startsWith("info") || !line.includes(" pv ")) continue;

      const depthMatch = line.match(/\bdepth (\d+)/);
      const pvIdx = line.match(/\bmultipv (\d+)/);
      const scoreMatch = line.match(/\bscore (cp|mate) (-?\d+)/);
      const pvMatch = line.match(/\bpv (.+)/);
      const nodesMatch = line.match(/\bnodes (\d+)/);
      const timeMatch = line.match(/\btime (\d+)/);

      if (!depthMatch || !scoreMatch || !pvMatch) continue;

      const pvIndex = pvIdx ? parseInt(pvIdx[1]) : 1;
      const depth = parseInt(depthMatch[1]);
      const pvMoves = pvMatch[1].trim().split(/\s+/);

      let evalCp = 0;
      let mate: number | null = null;

      if (scoreMatch[1] === "cp") {
        evalCp = parseInt(scoreMatch[2]);
      } else {
        mate = parseInt(scoreMatch[2]);
        evalCp = mate > 0 ? 10000 - mate * 10 : -10000 - mate * 10;
      }

      const existing = evals.get(pvIndex);
      if (!existing || depth > existing.depth) {
        evals.set(pvIndex, {
          bestMove: pvMoves[0] || "",
          eval: evalCp,
          mate,
          depth,
          pv: pvMoves,
          nodesSearched: nodesMatch ? parseInt(nodesMatch[1]) : undefined,
          timeMs: timeMatch ? parseInt(timeMatch[1]) : undefined,
        });
      }
    }

    // Fallback: extract bestmove if nothing parsed
    if (evals.size === 0) {
      const bestMoveMatch = output.match(/bestmove (\S+)/);
      if (bestMoveMatch) {
        evals.set(1, {
          bestMove: bestMoveMatch[1],
          eval: 0,
          mate: null,
          depth: 0,
          pv: [bestMoveMatch[1]],
        });
      }
    }

    return Array.from(evals.entries())
      .sort(([a], [b]) => a - b)
      .map(([, e]) => e);
  }

  send(command: string): void {
    this.process?.stdin?.write(command + "\n");
  }

  waitFor(token: string, timeoutMs: number = 30000): Promise<string> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const check = () => {
        if (this.buffer.includes(token)) {
          const result = this.buffer;
          resolve(result);
        } else if (Date.now() - startTime > timeoutMs) {
          reject(new Error(`Timeout waiting for "${token}"`));
        } else {
          setTimeout(check, 10);
        }
      };
      check();
    });
  }

  quit(): void {
    if (this.process) {
      const proc = this.process;
      try { this.send("quit"); } catch { /* ignore */ }
      try { proc.kill("SIGTERM"); } catch { /* ignore */ }
      // Backstop: if Stockfish didn't exit on SIGTERM (wedged search), SIGKILL it
      // so concurrency-capped streams don't pile up zombies.
      setTimeout(() => {
        try { if (!proc.killed) proc.kill("SIGKILL"); } catch { /* ignore */ }
      }, 1000).unref();
      this.process = null;
      this.isReady = false;
    }
  }

  isRunning(): boolean {
    return this.process !== null && this.isReady;
  }
}

// Singleton instance for server-wide reuse
let enginePromise: Promise<StockfishEngine> | null = null;

export async function getEngine(): Promise<StockfishEngine> {
  if (enginePromise) {
    const engine = await enginePromise;
    if (engine.isRunning()) return engine;
    enginePromise = null;
  }
  enginePromise = (async () => {
    const engine = new StockfishEngine();
    await engine.start();
    return engine;
  })().catch((err) => {
    enginePromise = null;
    throw err;
  });
  return enginePromise;
}

export async function shutdownEngine(): Promise<void> {
  if (enginePromise) {
    try {
      const engine = await enginePromise;
      engine.quit();
    } catch { /* engine never started */ }
    enginePromise = null;
  }
}

// ─── Streaming (SSE) ────────────────────────────────────────────────────────
export interface StreamLineData {
  rank: number;            // 1 = best
  scoreCp: number | null;  // centipawns from side-to-move POV; null if mate
  mate: number | null;     // signed plies to mate; null if cp
  pv: string[];            // UCI moves
}

export interface StreamDepthEvent {
  depth: number;
  lines: StreamLineData[];
}

export interface AnalyzeStreamingOptions {
  fen: string;
  maxDepth?: number;
  multiPv?: number;
  minEmitDepth?: number;
  onDepth: (event: StreamDepthEvent) => void;
  onDone?: (finalDepth: number) => void;
  onError?: (err: Error) => void;
  onQueued?: (position: number) => void;
  signal?: AbortSignal;
}

// ─── Concurrency cap for analyzeStreaming ──────────────────────────────────
// Each stream spawns its own Stockfish (MultiPV=8 ≈ 150 MB). Cap the number of
// simultaneous engines so a small Railway box can't be OOM-killed by traffic.
const MAX_CONCURRENT_STREAMS = Math.max(
  1,
  parseInt(process.env.STOCKFISH_MAX_CONCURRENT ?? "4", 10) || 4,
);

let activeStreams = 0;
type Waiter = { resolve: () => void; cancelled: boolean };
const waitQueue: Waiter[] = [];

function pumpQueue() {
  while (activeStreams < MAX_CONCURRENT_STREAMS && waitQueue.length > 0) {
    const next = waitQueue.shift()!;
    if (next.cancelled) continue;
    activeStreams++;
    next.resolve();
  }
}

function acquireSlot(signal?: AbortSignal): {
  acquired: Promise<void>;
  position: number; // 0 = ran immediately, N = queued behind N others
} {
  if (activeStreams < MAX_CONCURRENT_STREAMS) {
    activeStreams++;
    return { acquired: Promise.resolve(), position: 0 };
  }
  const position = waitQueue.length + 1;
  let waiter!: Waiter;
  const acquired = new Promise<void>((resolve, reject) => {
    waiter = { resolve, cancelled: false };
    waitQueue.push(waiter);
    if (signal) {
      const onAbort = () => {
        waiter.cancelled = true;
        const idx = waitQueue.indexOf(waiter);
        if (idx >= 0) waitQueue.splice(idx, 1);
        reject(new Error("aborted"));
      };
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    }
  });
  return { acquired, position };
}

function releaseSlot() {
  activeStreams = Math.max(0, activeStreams - 1);
  pumpQueue();
}

/**
 * Stream iterative-deepening Stockfish analysis. Spawns a dedicated engine
 * per call so concurrent streams (e.g., from multiple tabs) do not collide
 * with the shared engine used by /api/analyze/game.
 */
export async function analyzeStreaming(opts: AnalyzeStreamingOptions): Promise<void> {
  const {
    fen,
    maxDepth = 22,
    multiPv = 8,
    minEmitDepth = 8,
    onDepth,
    onDone,
    onError,
    onQueued,
    signal,
  } = opts;

  // Acquire a concurrency slot. If the queue is full, hold the connection open
  // and let the caller emit `event: queued` so the client knows we're alive.
  const { acquired, position } = acquireSlot(signal);
  if (position > 0) {
    try { onQueued?.(position); } catch (e) { console.error("onQueued error:", e); }
  }
  try {
    await acquired;
  } catch {
    // signal aborted while queued — nothing to clean up
    return;
  }

  let slotReleased = false;
  const releaseOnce = () => {
    if (slotReleased) return;
    slotReleased = true;
    releaseSlot();
  };

  const engine = new StockfishEngine();

  let currentDepth = 0;
  let lastEmittedDepth = 0;
  const currentLines = new Map<number, StreamLineData>();
  let resolved = false;

  return new Promise<void>((resolve, reject) => {
    let abortHandler: (() => void) | null = null;

    const flush = (depth: number) => {
      if (depth < minEmitDepth) return;
      if (depth <= lastEmittedDepth) return;
      const lines = Array.from(currentLines.values()).sort((a, b) => a.rank - b.rank);
      if (lines.length === 0) return;
      try { onDepth({ depth, lines }); } catch (e) { console.error("onDepth callback error:", e); }
      lastEmittedDepth = depth;
    };

    const cleanup = () => {
      if (abortHandler && signal) signal.removeEventListener("abort", abortHandler);
      try { engine.send("stop"); } catch { /* ignore */ }
      try { engine.quit(); } catch { /* ignore */ }
      releaseOnce();
    };

    const finish = (err?: Error) => {
      if (resolved) return;
      resolved = true;
      // Final flush of last completed depth, if not yet emitted
      flush(currentDepth);
      cleanup();
      if (err) {
        try { onError?.(err); } catch (e) { console.error(e); }
        reject(err);
      } else {
        try { onDone?.(currentDepth); } catch (e) { console.error(e); }
        resolve();
      }
    };

    if (signal) {
      if (signal.aborted) { finish(); return; }
      abortHandler = () => finish();
      signal.addEventListener("abort", abortHandler);
    }

    engine.onStdoutLine = (line: string) => {
      if (line.startsWith("info") && line.includes(" pv ")) {
        const dM = line.match(/\bdepth (\d+)/);
        const mpvM = line.match(/\bmultipv (\d+)/);
        const scM = line.match(/\bscore (cp|mate) (-?\d+)/);
        const pvM = line.match(/\bpv (.+)/);
        if (!dM || !scM || !pvM) return;

        const depth = parseInt(dM[1], 10);
        if (depth > maxDepth) return;
        const rank = mpvM ? parseInt(mpvM[1], 10) : 1;
        const pv = pvM[1].trim().split(/\s+/);
        const scoreCp = scM[1] === "cp" ? parseInt(scM[2], 10) : null;
        const mate = scM[1] === "mate" ? parseInt(scM[2], 10) : null;

        if (depth > currentDepth) {
          // New depth started — flush whatever we have for the previous depth
          flush(currentDepth);
          currentDepth = depth;
          currentLines.clear();
        }
        if (depth === currentDepth) {
          currentLines.set(rank, { rank, scoreCp, mate, pv });
        }
      } else if (line.startsWith("bestmove")) {
        finish();
      }
    };

    (async () => {
      try {
        await engine.start({
          threads: parseInt(process.env.STOCKFISH_STREAM_THREADS ?? "2", 10),
          hashMb: parseInt(process.env.STOCKFISH_STREAM_HASH_MB ?? "128", 10),
        });
        engine.send(`setoption name MultiPV value ${multiPv}`);
        engine.send("isready");
        await engine.waitFor("readyok", 5000);
        engine.send(`position fen ${fen}`);
        engine.send(`go depth ${maxDepth}`);
      } catch (e) {
        finish(e instanceof Error ? e : new Error(String(e)));
      }
    })();
  });
}
