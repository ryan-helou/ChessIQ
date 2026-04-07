"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { Chess } from "chess.js";
import type { TrainerPuzzle } from "@/lib/puzzle-api";

const Chessboard = dynamic(
  () => import("react-chessboard").then((m) => m.Chessboard),
  {
    ssr: false,
    loading: () => (
      <div className="w-full aspect-square bg-[#3a3835]/40 rounded-lg animate-pulse" />
    ),
  }
);

type PuzzleState =
  | "loading"       // Setting up puzzle
  | "opponentSetup" // Auto-playing opponent's setup move
  | "playerTurn"    // Waiting for player to make a move
  | "correct"       // Player just made a correct move
  | "wrong"         // Player just made a wrong move
  | "solved"        // All solution moves found
  | "failed";       // Gave up or too many failures

interface Props {
  puzzle: TrainerPuzzle;
  onSolved: (attempts: number, timeSeconds: number) => void;
  onFailed: (attempts: number, timeSeconds: number) => void;
  onNext: () => void;
}

export default function PuzzleBoard({ puzzle, onSolved, onFailed, onNext }: Props) {
  const [game, setGame] = useState<Chess>(new Chess());
  const [state, setState] = useState<PuzzleState>("loading");
  const [solutionIndex, setSolutionIndex] = useState(0); // which player move we're on
  const [opponentIndex, setOpponentIndex] = useState(0); // which opponent move we're on
  const [attempts, setAttempts] = useState(0);
  const [hintSquare, setHintSquare] = useState<string | null>(null);
  const [lastMoveSquares, setLastMoveSquares] = useState<{ from: string; to: string } | null>(null);
  const [feedbackSquare, setFeedbackSquare] = useState<{ square: string; color: string } | null>(null);
  const startTimeRef = useRef(Date.now());

  // Determine board orientation from puzzle FEN
  const boardOrientation = useCallback(() => {
    const chess = new Chess(puzzle.fen);
    // After opponent setup moves, it's player's turn
    // If there are opponent setup moves, player is the OTHER color
    if (puzzle.opponentMoves.length > 0) {
      // FEN turn indicates who moves first — opponent moves first
      return chess.turn() === "w" ? "black" : "white";
    }
    // Own-blunder puzzles: player is the side to move
    return chess.turn() === "w" ? "white" : "black";
  }, [puzzle]);

  // Initialize puzzle
  useEffect(() => {
    const chess = new Chess(puzzle.fen);
    setGame(chess);
    setSolutionIndex(0);
    setOpponentIndex(0);
    setAttempts(0);
    setHintSquare(null);
    setLastMoveSquares(null);
    setFeedbackSquare(null);
    startTimeRef.current = Date.now();

    if (puzzle.opponentMoves.length > 0) {
      // Auto-play the first opponent move after a short delay
      setState("opponentSetup");
      const timer = setTimeout(() => {
        playOpponentMove(chess, 0);
      }, 600);
      return () => clearTimeout(timer);
    } else {
      setState("playerTurn");
    }
  }, [puzzle]);

  const playOpponentMove = useCallback(
    (chess: Chess, oppIdx: number) => {
      const uci = puzzle.opponentMoves[oppIdx];
      if (!uci || uci.length < 4) {
        setState("playerTurn");
        return;
      }

      const from = uci.slice(0, 2);
      const to = uci.slice(2, 4);
      const promotion = uci.length > 4 ? uci[4] : undefined;

      try {
        chess.move({ from, to, promotion });
        const newGame = new Chess(chess.fen());
        setGame(newGame);
        setLastMoveSquares({ from, to });
        setOpponentIndex(oppIdx + 1);
        setState("playerTurn");
      } catch {
        setState("playerTurn");
      }
    },
    [puzzle]
  );

  const getElapsedSeconds = () => Math.round((Date.now() - startTimeRef.current) / 1000);

  const handlePieceDrop = useCallback(
    ({ sourceSquare, targetSquare, piece }: { piece: { pieceType: string; position: string; isSparePiece: boolean }; sourceSquare: string; targetSquare: string | null }): boolean => {
      if (!targetSquare) return false;
      if (state !== "playerTurn") return false;

      const expectedUci = puzzle.solutionMoves[solutionIndex];
      if (!expectedUci) return false;

      const expectedFrom = expectedUci.slice(0, 2);
      const expectedTo = expectedUci.slice(2, 4);
      const expectedPromotion = expectedUci.length > 4 ? expectedUci[4] : undefined;

      // Try to make the move on the board
      const gameCopy = new Chess(game.fen());
      const promotion = piece.pieceType?.toLowerCase() === "p" &&
        (targetSquare[1] === "8" || targetSquare[1] === "1")
        ? "q"
        : undefined;

      try {
        gameCopy.move({ from: sourceSquare, to: targetSquare, promotion });
      } catch {
        return false; // illegal move
      }

      // Check if correct
      const isCorrect =
        sourceSquare === expectedFrom &&
        targetSquare === expectedTo &&
        (!expectedPromotion || promotion === expectedPromotion);

      if (isCorrect) {
        setGame(new Chess(gameCopy.fen()));
        setLastMoveSquares({ from: sourceSquare, to: targetSquare });
        setFeedbackSquare({ square: targetSquare, color: "rgba(150, 188, 75, 0.6)" });
        setHintSquare(null);

        const nextSolIdx = solutionIndex + 1;
        setSolutionIndex(nextSolIdx);

        if (nextSolIdx >= puzzle.solutionMoves.length) {
          // Puzzle solved!
          setState("solved");
          onSolved(attempts + 1, getElapsedSeconds());
        } else {
          // Play opponent's response, then player goes again
          setState("correct");
          const nextOppIdx = opponentIndex;
          setTimeout(() => {
            const nextOppMove = puzzle.opponentMoves[nextOppIdx];
            if (nextOppMove) {
              playOpponentMove(gameCopy, nextOppIdx);
            } else {
              setState("playerTurn");
            }
          }, 500);
        }
        return true;
      } else {
        // Wrong move — undo it visually
        setAttempts((a) => a + 1);
        setFeedbackSquare({ square: targetSquare, color: "rgba(202, 52, 49, 0.6)" });

        const newAttempts = attempts + 1;

        if (newAttempts >= 1) {
          // Show hint: highlight the correct source square
          setHintSquare(expectedFrom);
        }

        if (newAttempts >= 3) {
          // Auto-play solution and fail
          setState("failed");
          autoPlaySolution(game);
          onFailed(newAttempts, getElapsedSeconds());
          return false;
        }

        setState("wrong");
        setTimeout(() => {
          setFeedbackSquare(null);
          setState("playerTurn");
        }, 800);
        return false;
      }
    },
    [state, game, puzzle, solutionIndex, opponentIndex, attempts, onSolved, onFailed, playOpponentMove]
  );

  const autoPlaySolution = useCallback(
    (currentGame: Chess) => {
      const chess = new Chess(currentGame.fen());
      let moveIdx = solutionIndex;
      let oppIdx = opponentIndex;
      let delay = 0;

      const playNext = () => {
        // Play player's solution move
        const solMove = puzzle.solutionMoves[moveIdx];
        if (!solMove) return;

        setTimeout(() => {
          try {
            const from = solMove.slice(0, 2);
            const to = solMove.slice(2, 4);
            const promotion = solMove.length > 4 ? solMove[4] : undefined;
            chess.move({ from, to, promotion });
            setGame(new Chess(chess.fen()));
            setLastMoveSquares({ from, to });
            setFeedbackSquare({ square: to, color: "rgba(150, 188, 75, 0.4)" });
          } catch {}

          moveIdx++;

          // Play opponent's response
          const oppMove = puzzle.opponentMoves[oppIdx];
          if (oppMove && moveIdx < puzzle.solutionMoves.length) {
            setTimeout(() => {
              try {
                const from = oppMove.slice(0, 2);
                const to = oppMove.slice(2, 4);
                const promotion = oppMove.length > 4 ? oppMove[4] : undefined;
                chess.move({ from, to, promotion });
                setGame(new Chess(chess.fen()));
                setLastMoveSquares({ from, to });
              } catch {}
              oppIdx++;
              playNext();
            }, 600);
          }
        }, delay);

        delay += 1200;
      };

      playNext();
    },
    [puzzle, solutionIndex, opponentIndex]
  );

  // Build square styles
  const customSquareStyles: Record<string, React.CSSProperties> = {};

  if (lastMoveSquares) {
    customSquareStyles[lastMoveSquares.from] = {
      backgroundColor: "rgba(255, 255, 50, 0.3)",
    };
    customSquareStyles[lastMoveSquares.to] = {
      backgroundColor: "rgba(255, 255, 50, 0.3)",
    };
  }

  if (feedbackSquare) {
    customSquareStyles[feedbackSquare.square] = {
      backgroundColor: feedbackSquare.color,
    };
  }

  if (hintSquare && state === "playerTurn") {
    customSquareStyles[hintSquare] = {
      backgroundColor: "rgba(150, 188, 75, 0.4)",
      boxShadow: "inset 0 0 12px rgba(150, 188, 75, 0.6)",
    };
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="aspect-square" style={{ width: "min(520px, calc(80vw - 44px))" }}>
        <Chessboard
          options={{
            position: game.fen(),
            squareStyles: customSquareStyles,
            darkSquareStyle: { backgroundColor: "#779952" },
            lightSquareStyle: { backgroundColor: "#edeed1" },
            boardOrientation: boardOrientation(),
            allowDragging: state === "playerTurn",
            animationDurationInMs: 200,
            onPieceDrop: handlePieceDrop,
          }}
        />
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-1">
        {state === "playerTurn" && (
          <span className="text-sm text-[#e8e6e1] font-medium">
            Your turn — find the best move
          </span>
        )}
        {state === "correct" && (
          <span className="text-sm text-[#96bc4b] font-medium">
            Correct! Opponent is responding...
          </span>
        )}
        {state === "wrong" && (
          <span className="text-sm text-[#ca3431] font-medium">
            Not quite — try again{hintSquare ? " (hint shown)" : ""}
          </span>
        )}
        {state === "solved" && (
          <span className="text-sm text-[#96bc4b] font-bold">
            Puzzle solved!
          </span>
        )}
        {state === "failed" && (
          <span className="text-sm text-[#ca3431] font-medium">
            Showing the solution...
          </span>
        )}
        {state === "opponentSetup" && (
          <span className="text-sm text-[#989795]">
            Setting up position...
          </span>
        )}
        {state === "loading" && (
          <span className="text-sm text-[#989795]">Loading puzzle...</span>
        )}

        {(state === "solved" || state === "failed") && (
          <button
            onClick={onNext}
            className="px-4 py-1.5 bg-[#81b64c] hover:bg-[#96bc4b] text-white text-sm font-bold rounded transition-colors"
          >
            Next Puzzle →
          </button>
        )}
      </div>
    </div>
  );
}
