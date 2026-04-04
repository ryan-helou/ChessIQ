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
  private isReady = false;

  async start(): Promise<void> {
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
        });

        this.process.stdout?.on("data", (data: Buffer) => {
          this.buffer += data.toString();
        });

        this.process.stderr?.on("data", (data: Buffer) => {
          console.error(`Stockfish stderr: ${data.toString()}`);
        });

        // Initialize engine
        this.send("uci");
        this.waitFor("uciok", 5000).then(() => {
          // Configure engine for game analysis
          this.send("setoption name Threads value 2");
          this.send("setoption name Hash value 128");
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

    this.send("ucinewgame");
    this.send("isready");
    await this.waitFor("readyok", 5000);

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

  private send(command: string): void {
    this.process?.stdin?.write(command + "\n");
  }

  private waitFor(token: string, timeoutMs: number = 30000): Promise<string> {
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
      this.send("quit");
      this.process.kill("SIGTERM");
      this.process = null;
      this.isReady = false;
    }
  }

  isRunning(): boolean {
    return this.process !== null && this.isReady;
  }
}

// Singleton instance for server-wide reuse
let engineInstance: StockfishEngine | null = null;

export async function getEngine(): Promise<StockfishEngine> {
  if (!engineInstance) {
    engineInstance = new StockfishEngine();
    await engineInstance.start();
  }
  return engineInstance;
}

export async function shutdownEngine(): Promise<void> {
  if (engineInstance) {
    engineInstance.quit();
    engineInstance = null;
  }
}
