/**
 * Chess.com "Neo" piece set — loaded from their public CDN.
 * Compatible with react-chessboard's `pieces` option.
 */

const PIECE_KEYS = ["wP","wN","wB","wR","wQ","wK","bP","bN","bB","bR","bQ","bK"] as const;

type PieceProps = { fill?: string; square?: string; svgStyle?: React.CSSProperties };

export const neoPieces: Record<string, (props?: PieceProps) => React.JSX.Element> =
  Object.fromEntries(
    PIECE_KEYS.map((key) => [
      key,
      (props?: PieceProps) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`https://www.chess.com/chess-themes/pieces/neo/150/${key.toLowerCase()}.png`}
          alt={key}
          draggable={false}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            userSelect: "none",
            pointerEvents: "none",
            ...props?.svgStyle,
          }}
        />
      ),
    ])
  );
