"use client";

import { useRef } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

interface EvalPoint {
  move: number;
  eval: number;
  mate: number | null;
}

interface Props {
  data: EvalPoint[];
  currentMove: number;
  onMoveClick: (move: number) => void;
  mini?: boolean;
}

export default function EvalGraph({ data, currentMove, onMoveClick, mini }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Clamp eval for display (-500 to 500 centipawns)
  const chartData = data.map((d) => ({
    ...d,
    displayEval: d.mate !== null
      ? d.mate > 0
        ? 500   // white can mate → white winning
        : d.mate < 0
          ? -500  // black can mate → black winning
          // mate === 0: game over, side to move was just mated
          // odd move number = white just moved = black is mated = white wins
          : d.move % 2 === 1 ? 500 : -500
      : Math.max(-500, Math.min(500, d.eval)),
    isCurrent: d.move === currentMove,
  }));

  // Position-based click: calculate which move was clicked from X coordinate.
  // Reliable on both quick clicks and touch — doesn't depend on Recharts activePayload.
  function handlePositionClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!containerRef.current || data.length === 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const idx = Math.min(data.length - 1, Math.max(0, Math.round(x * (data.length - 1))));
    onMoveClick(data[idx].move);
  }

  return (
    <div
      ref={containerRef}
      className={`w-full ${mini ? "h-full" : "h-[120px]"} relative [&_*]:outline-none`}
      style={{ cursor: "pointer" }}
      onMouseDown={(e) => e.preventDefault()}
      onClick={handlePositionClick}
    >
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <AreaChart
          data={chartData}
          margin={mini ? { top: 2, right: 2, bottom: 2, left: 2 } : undefined}
        >
          <defs>
            {/* Two-tone gradient: white advantage above 0 (top half), black advantage below 0 (bottom half).
                YAxis domain is [-500, 500] so y=0 sits exactly at 50% of the chart height. */}
            <linearGradient id="evalGradient" x1="0" y1="0" x2="0" y2="1">
              {/* White advantage — top half */}
              <stop offset="0%"   stopColor="#f0ede4" stopOpacity={0.75} />
              <stop offset="50%"  stopColor="#f0ede4" stopOpacity={0.08} />
              {/* Black advantage — bottom half */}
              <stop offset="50%"  stopColor="#524f68" stopOpacity={0.15} />
              <stop offset="100%" stopColor="#524f68" stopOpacity={0.65} />
            </linearGradient>
          </defs>
          <XAxis dataKey="move" hide />
          <YAxis domain={[-500, 500]} hide />
          <ReferenceLine y={0} stroke="#524f68" strokeWidth={1} />
          {currentMove > 0 && (
            <ReferenceLine
              x={currentMove}
              stroke="#d4a84b"
              strokeWidth={2}
              strokeDasharray="3 3"
            />
          )}
          {!mini && (
            <Tooltip
              contentStyle={{
                backgroundColor: "#09090f",
                border: "1px solid #222136",
                borderRadius: "6px",
                color: "#f0ede4",
                fontSize: 12,
              }}
              formatter={(value: any, _name: any, props: any) => {
                const point = props?.payload;
                if (point?.mate != null) {
                  return [`M${Math.abs(point.mate)}`, point.mate > 0 ? "White wins" : "Black wins"];
                }
                const v = Number(value);
                const evalStr = v > 0 ? `+${(v / 100).toFixed(1)}` : (v / 100).toFixed(1);
                return [evalStr, "Eval"];
              }}
              labelFormatter={(label) => `Move ${label}`}
            />
          )}
          <Area
            type="monotone"
            dataKey="displayEval"
            stroke="#9896b4"
            strokeWidth={mini ? 1 : 1.5}
            fill="url(#evalGradient)"
            fillOpacity={1}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
