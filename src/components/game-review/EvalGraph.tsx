"use client";

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
  // Clamp eval for display (-500 to 500 centipawns)
  const chartData = data.map((d) => ({
    ...d,
    displayEval: d.mate !== null
      ? d.mate > 0 ? 500 : -500
      : Math.max(-500, Math.min(500, d.eval)),
    isCurrent: d.move === currentMove,
  }));

  const height = mini ? "100%" : "100%";

  return (
    <div className={`w-full ${mini ? "h-full" : "h-[120px]"}`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={chartData}
          onClick={(e: any) => {
            if (e?.activePayload?.[0]?.payload) {
              onMoveClick(e.activePayload[0].payload.move);
            }
          }}
          style={{ cursor: mini ? "default" : "pointer" }}
          margin={mini ? { top: 2, right: 2, bottom: 2, left: 2 } : undefined}
        >
          <defs>
            <linearGradient id="evalWhite" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f8fafc" stopOpacity={0.6} />
              <stop offset="100%" stopColor="#f8fafc" stopOpacity={0.05} />
            </linearGradient>
            <linearGradient id="evalBlack" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#1e293b" stopOpacity={0.8} />
              <stop offset="100%" stopColor="#1e293b" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <XAxis dataKey="move" hide />
          <YAxis domain={[-500, 500]} hide />
          <ReferenceLine y={0} stroke="#475569" strokeWidth={1} />
          {!mini && currentMove > 0 && (
            <ReferenceLine
              x={currentMove}
              stroke="#3b82f6"
              strokeWidth={2}
              strokeDasharray="3 3"
            />
          )}
          {!mini && (
            <Tooltip
              contentStyle={{
                backgroundColor: "#0f172a",
                border: "1px solid #1e293b",
                borderRadius: "6px",
                color: "#e2e8f0",
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
            stroke="#94a3b8"
            strokeWidth={mini ? 1 : 1.5}
            fill="url(#evalWhite)"
            fillOpacity={1}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
