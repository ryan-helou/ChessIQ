import { spawn, ChildProcess } from "child_process";

export interface EngineEval {
  bestMove: string;
  eval: number; // centipawns from white's perspective
  mate: number | null; // mate in N (positive = white wins, negative = black wins)
  depth: number;
  pv: string[]; // principal variation (best line)
}

export interface MultiLineEval {
  lines: EngineEval[];
}

const STOCKFISH_PATH = process.env.STOCKFISH_PATH ?? "stockfish";

export class StockfishEngine {
  private process: ChildProcess | null = null;
  private buffer = "";
  private resolveReady: (() => void) | null = null;

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.process = spawn(STOCKFISH_PATH, [], {
        stdio: ["pipe", "pipe", "pipe"],
      });

      this.process.on("error", (err) => {
        reject(new Error(`Failed to start Stockfish: ${err.message}`));
      });

      this.process.stdout?.on("data", (data: Buffer) => {
        this.buffer += data.toString();
      });

      this.send("uci");
      this.waitFor("uciok").then(() => {
        // Set reasonable defaults
        this.send("setoption name Threads value 1");
        this.send("setoption name Hash value 64");
        this.send("isready");
        this.waitFor("readyok").then(() => resolve());
      });
    });
  }

  async evaluate(
    fen: string,
    depth: number = 20,
    multiPv: number = 1
  ): Promise<MultiLineEval> {
    if (!this.process) throw new Error("Engine not started");

    this.send("ucinewgame");
    this.send("isready");
    await this.waitFor("readyok");

    if (multiPv > 1) {
      this.send(`setoption name MultiPV value ${multiPv}`);
    }

    this.buffer = "";
    this.send(`position fen ${fen}`);
    this.send(`go depth ${depth}`);

    const output = await this.waitFor("bestmove");

    const lines = this.parseOutput(output, multiPv);

    // Reset MultiPV
    if (multiPv > 1) {
      this.send("setoption name MultiPV value 1");
    }

    return { lines };
  }

  async evaluatePosition(fen: string, depth: number = 20): Promise<EngineEval> {
    const result = await this.evaluate(fen, depth, 1);
    return result.lines[0];
  }

  private parseOutput(output: string, multiPv: number): EngineEval[] {
    const outputLines = output.split("\n");
    const evals = new Map<number, EngineEval>();

    for (const line of outputLines) {
      if (!line.startsWith("info") || !line.includes(" pv ")) continue;

      const depthMatch = line.match(/\bdepth (\d+)/);
      const pvIdx = line.match(/\bmultipv (\d+)/);
      const scoreMatch = line.match(/\bscore (cp|mate) (-?\d+)/);
      const pvMatch = line.match(/\bpv (.+)/);
      const bestMoveMatch = output.match(/bestmove (\S+)/);

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
          bestMove: pvMoves[0] || bestMoveMatch?.[1] || "",
          eval: evalCp,
          mate,
          depth,
          pv: pvMoves,
        });
      }
    }

    // If no lines parsed, try to get at least the bestmove
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

  private waitFor(token: string): Promise<string> {
    return new Promise((resolve) => {
      const check = () => {
        if (this.buffer.includes(token)) {
          const result = this.buffer;
          resolve(result);
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
      this.process.kill();
      this.process = null;
    }
  }
}
