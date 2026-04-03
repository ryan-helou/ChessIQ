export interface EngineEval {
  bestMove: string;
  eval: number; // centipawns from white's perspective
  mate: number | null;
  depth: number;
  pv: string[];
}

type MessageCallback = (eval_: EngineEval) => void;

export class BrowserStockfish {
  private worker: Worker | null = null;
  private messageBuffer = "";
  private listeners: ((line: string) => void)[] = [];
  private ready = false;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.worker = new Worker("/stockfish-worker.js");
      } catch {
        reject(new Error("Failed to create Stockfish worker"));
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error("Stockfish initialization timed out"));
      }, 15000);

      this.worker.onmessage = (e) => {
        const msg = typeof e.data === "string" ? e.data : String(e.data);

        if (msg === "__WORKER_READY__") {
          // Send UCI init
          this.send("uci");
          return;
        }

        if (msg.includes("uciok") && !this.ready) {
          this.ready = true;
          this.send("setoption name Skill Level value 20");
          this.send("isready");
          return;
        }

        if (msg.includes("readyok") && this.ready) {
          clearTimeout(timeout);
          // Re-attach handler for normal operation
          this.worker!.onmessage = (e2) => {
            const line = typeof e2.data === "string" ? e2.data : String(e2.data);
            for (const listener of this.listeners) {
              listener(line);
            }
          };
          resolve();
          return;
        }
      };

      this.worker.onerror = (err) => {
        clearTimeout(timeout);
        reject(new Error(`Stockfish worker error: ${err.message}`));
      };
    });
  }

  async evaluate(fen: string, depth: number = 16): Promise<EngineEval> {
    if (!this.worker) throw new Error("Engine not initialized");

    return new Promise((resolve) => {
      let bestResult: EngineEval = {
        bestMove: "",
        eval: 0,
        mate: null,
        depth: 0,
        pv: [],
      };

      const listener = (line: string) => {
        // Parse info lines for eval updates
        if (line.startsWith("info") && line.includes(" pv ")) {
          const depthMatch = line.match(/\bdepth (\d+)/);
          const scoreMatch = line.match(/\bscore (cp|mate) (-?\d+)/);
          const pvMatch = line.match(/\bpv (.+)/);

          if (depthMatch && scoreMatch && pvMatch) {
            const d = parseInt(depthMatch[1]);
            let evalCp = 0;
            let mate: number | null = null;

            if (scoreMatch[1] === "cp") {
              evalCp = parseInt(scoreMatch[2]);
            } else {
              mate = parseInt(scoreMatch[2]);
              evalCp = mate > 0 ? 10000 - mate * 10 : -10000 - mate * 10;
            }

            if (d >= bestResult.depth) {
              bestResult = {
                bestMove: pvMatch[1].trim().split(/\s+/)[0],
                eval: evalCp,
                mate,
                depth: d,
                pv: pvMatch[1].trim().split(/\s+/),
              };
            }
          }
        }

        // Best move line = analysis complete
        if (line.startsWith("bestmove")) {
          const bm = line.match(/bestmove (\S+)/);
          if (bm && !bestResult.bestMove) {
            bestResult.bestMove = bm[1];
          }
          this.removeListener(listener);
          resolve(bestResult);
        }
      };

      this.addListener(listener);
      this.send("ucinewgame");
      this.send(`position fen ${fen}`);
      this.send(`go depth ${depth}`);
    });
  }

  private send(cmd: string) {
    this.worker?.postMessage(cmd);
  }

  private addListener(fn: (line: string) => void) {
    this.listeners.push(fn);
  }

  private removeListener(fn: (line: string) => void) {
    this.listeners = this.listeners.filter((l) => l !== fn);
  }

  destroy() {
    this.worker?.terminate();
    this.worker = null;
    this.listeners = [];
  }
}
