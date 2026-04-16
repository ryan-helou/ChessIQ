# Chess IQ Development Guidelines

## Project Vision
**Chess IQ** is an all-in-one chess improvement platform designed to help players analyze, understand, and fix their weaknesses. Unlike basic stat trackers, Chess IQ provides intelligent analysis that identifies *why* you lose, what patterns you struggle with, and curates personalized puzzles to address your specific weaknesses.

### Mission
Transform raw game data into actionable improvement strategies through:
- **Game Reviews** - Chess.com-quality analysis of every game
- **Loss Pattern Detection** - Identify recurring mistakes (king safety, overextension, missed tactics)
- **Opening Analytics** - Win/loss rates and accuracy by opening, with blunder patterns
- **Puzzle Curation** - AI-powered puzzle recommendations based on identified weaknesses
- **Tactical Theme Tracking** - Monitor improvement on specific tactics (pins, forks, skewers, etc.)

**Tech Stack:**
- **Frontend:** React 19, Next.js 16, Tailwind CSS 4, TypeScript 5
- **Backend:** Next.js API Routes
- **Engine:** Stockfish (position evaluation & deep analysis)
- **Libraries:** chess.js (PGN parsing), recharts (visualizations), date-fns (dates)
- **APIs:** Chess.com Public API, Lichess Puzzle DB, Lichess Opening Explorer, Lichess Syzygy Tablebase API
- **Data Storage:** PostgreSQL via raw SQL (pg), Redis (caching, rate limiting)

---

## Core Modules & Features

### 1. Game Review & Analysis (`/src/modules/game-review`)
**Goal:** Replicate Chess.com's built-in game review with deep engine analysis.

**Responsibilities:**
- Load game PGN and analyze every move
- Detect blunders, mistakes, inaccuracies vs. Stockfish best moves
- Provide position context and tactical themes present at decision points
- Generate move annotations with explanations
- Show eval graph throughout the game
- Identify critical moments where the game was lost/won

**Key Functions:**
```typescript
analyzeGame(pgn: string, depth: number = 20): GameAnalysis
  - Returns: blunders[], criticalmoves[], evalGraph, annotations

detectBlunder(move: string, fen: string, bestMove: string, depth: number): BlunderType
  - Returns: "blunder" | "mistake" | "inaccuracy" | "brilliant" | "best"

getTacticalThemesAtPosition(fen: string): TacticalTheme[]
  - Returns: pins[], forks[], skewers[], backRankThreats[], etc.

generateMoveAnnotation(position, move, bestMove, eval): Annotation
  - Returns: human-readable explanation of why the move is good/bad
```

**Data Model:**
```typescript
interface GameAnalysis {
  gameId: string;
  moves: AnalyzedMove[];
  blunders: Blunder[];
  criticalMoments: CriticalMoment[];
  evalGraph: EvalPoint[];
  openingPhase: { ecCode: string; name: string; moveNumber: number };
  middlegameStart: number;
  endgameStart: number;
}

interface AnalyzedMove {
  moveNumber: number;
  move: string;
  san: string;
  fen: string;
  isBlunder: boolean;
  isMistake: boolean;
  engineEval: number; // Centipawns
  accuracy: number; // 0-100
  bestMove?: string;
  alternativeMoves?: string[];
  tacticalThemes: TacticalTheme[]; // Pins, forks, etc. available at this position
  annotation?: string;
}

interface Blunder {
  moveNumber: number;
  move: string;
  playerEval: number;
  engineEval: number;
  lossOfMaterial?: number; // centipawns lost
  allowedTactic?: TacticalTheme; // What the opponent could do next
  severity: "blunder" | "mistake" | "inaccuracy";
}

type TacticalTheme =
  | "pin"
  | "fork"
  | "skewer"
  | "backRankMate"
  | "doubleAttack"
  | "discoveredAttack"
  | "sacrifice"
  | "promotion"
  | "trapped"
  | "hanging"
  | "undefended";
```

---

### 2. Loss Pattern Detection (`/src/modules/loss-analysis`)
**Goal:** Identify systematic weaknesses across multiple games.

**Responsibilities:**
- Categorize losses by reason (tactical, positional, time pressure, etc.)
- Track repeated mistakes and patterns
- Identify opening-specific weaknesses
- Monitor king safety issues, overextension, missed tactics pattern

**Loss Reason Categories:**
```typescript
type LossReason =
  // Tactical
  | "missed_pin"
  | "missed_fork"
  | "missed_skewer"
  | "missing_back_rank"
  | "missing_discovered_attack"
  | "hanging_piece"
  | "underdefended_piece"

  // Positional
  | "overextension"
  | "weak_king_safety"
  | "exposed_king"
  | "poor_pawn_structure"
  | "inactive_pieces"
  | "pawn_breakthrough_missed"

  // Opening/Strategy
  | "bad_opening_preparation"
  | "premature_attack"
  | "passive_position";

interface GameLossAnalysis {
  gameId: string;
  result: "loss" | "draw";
  primaryReasons: LossReason[]; // 1-3 main reasons
  secondaryReasons: LossReason[];
  criticalBlunder?: Blunder;
  moveNumberLost: number; // When the position became losing

  // Specific insights
  openingLine?: string;
  timeSpentOnMove?: number; // Move with worst time/move ratio

  // For draws: why didn't you win?
  missedWinAtMove?: number;
}

interface PatternStats {
  totalGames: number;
  lossRate: number;
  topLossReasons: { reason: LossReason; frequency: number }[];
  byTimeControl: Record<TimeClass, LossReasonBreakdown>;
  byColor: Record<"white" | "black", LossReasonBreakdown>;
  byOpening: Record<string, LossReasonBreakdown>;
}
```

---

### 3. Opening Analytics (`/src/modules/opening-analysis`)
**Goal:** Deep dive into opening-specific performance and weaknesses.

**Responsibilities:**
- Track all openings player uses (both colors)
- Calculate win/loss rates per opening
- Identify where blunders happen most in opening
- Find tactical themes common in specific openings
- Recommend puzzle themes for weak openings

**Data Model:**
```typescript
interface OpeningStats {
  ecCode: string;
  name: string;
  variations: OpeningVariation[];

  byColor: {
    white: ColorOpeningStats;
    black: ColorOpeningStats;
  };
}

interface ColorOpeningStats {
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  accuracy: number;

  // Loss analysis
  topLossReasons: { reason: LossReason; count: number }[];
  blundersByMove: { moveNumber: number; frequency: number }[];

  // Tactical patterns
  tacticsMissed: { theme: TacticalTheme; count: number }[];

  // Deep prep line - where do you deviate from "book"?
  preparationDepth: number; // How many moves "known" before blunders start

  // Recommendations
  recommendedPuzzleThemes: TacticalTheme[];
}

interface OpeningVariation {
  moves: string[]; // Opening line
  popularity: number; // How often you play it
  accuracy: number;
  winRate: number;
  blundersInLine: number;
}
```

---

### 4. Puzzle Curation Engine (`/src/modules/puzzle-engine`)
**Goal:** Recommend puzzles that directly address player weaknesses.

**Responsibilities:**
- Analyze player blunders and loss patterns
- Map to specific tactical/strategic themes
- Source puzzles (Chessprogramming, Lichess API, community puzzles)
- Personalize difficulty based on player skill
- Track puzzle performance over time

**Algorithm:**
```typescript
interface PuzzleRecommendation {
  reason: "you_missed_this_in_game" | "weakness_in_opening" | "tactical_theme";
  relatedGames: string[]; // Which games this addresses
  puzzleThemes: TacticalTheme[];
  difficulty: "beginner" | "intermediate" | "advanced" | "expert";
  puzzles: Puzzle[];
}

interface Puzzle {
  fen: string;
  bestMove: string;
  solution: string; // Annotation of best continuation
  difficulty: number; // 1-2500
  tacticalThemes: TacticalTheme[];
  source: "chessprogramming" | "lichess" | "custom";
  sourceId: string;
}

// Smart recommendations
function recommendPuzzles(player: PlayerProfile): PuzzleRecommendation[] {
  // 1. Find top loss reasons
  const lossPatterns = getTopLossPatterns(player.lastGames);

  // 2. Find opening weaknesses
  const openingWeaknesses = getOpeningWeaknesses(player.openingStats);

  // 3. Find missed tactics
  const missedTactics = getMostMissedTacticThemes(player.blunders);

  // 4. Create recommendations targeting each
  return [
    { reason: "tactical_theme", themes: missedTactics, difficulty: "intermediate" },
    { reason: "opening_weakness", themes: relatedThemes(openingWeaknesses) },
    { reason: "loss_pattern", themes: relatedThemes(lossPatterns) }
  ];
}
```

**Puzzle Sources:**
- **Chessprogramming.org** - 6,000+ tactics
- **Lichess Puzzles API** - Millions of crowdsourced puzzles
- **Community Puzzles** - User-created based on their own games
- **Engine-Generated** - Create from player's own blunders

---

### 5. Blunder & Tactical Theme Detection (`/src/lib/game-analysis.ts`)
**Goal:** Extract tactical patterns from player mistakes and successes.

**Key insight:** It's not just about finding blunders—it's about categorizing *what kind* of blunder.

```typescript
type TacticalMiss = {
  type: TacticalTheme;
  inPosition: fen;
  playerMoved: string;
  bestMissed: string;
  consequence: string; // Lost piece, gave mate threat, etc.
};

// For wins: What good tactics did the player use?
type TacticalSuccess = {
  type: TacticalTheme;
  move: string;
  gainInMaterial: number;
  againstRating: number;
};

interface PlayerTacticalProfile {
  totalGamesAnalyzed: number;

  // Strengths
  bestTactics: Array<{ theme: TacticalTheme; accuracy: number }>;
  tacticSuccessRate: Record<TacticalTheme, number>; // % of time you found them

  // Weaknesses
  mostMissedTactics: Array<{ theme: TacticalTheme; missCount: number }>;

  // By rating bracket
  tacticsByRatingBracket: Record<string, {
    ratingRange: [number, number];
    lossRate: number;
    missedTactics: TacticalTheme[];
  }>;
}
```

---

## Platform Architecture

### Data Flow
```
Chess.com Games → Download PGN → Parse with chess.js → Stockfish Analysis →
Extract Loss Patterns → Update User Profile → Generate Recommendations →
Load Puzzles → Track Progress → Update Analytics
```

### Module Dependencies
```
game-review/
  ├─ Stockfish (engine analysis)
  ├─ chess.js (move validation & position tracking)
  └─ Output: AnalyzedMove[], Blunder[]

loss-analysis/
  ├─ game-review outputs
  ├─ pattern-matching algorithms
  └─ Output: LossReasonBreakdown, PlayerPattern

opening-analysis/
  ├─ game-review outputs
  ├─ ECO database (for opening names)
  └─ Output: OpeningStats by color

puzzle-engine/
  ├─ loss-analysis outputs
  ├─ opening-analysis outputs
  ├─ Puzzle source APIs (Lichess, Chessprogramming)
  └─ Output: Ranked puzzle recommendations

user-profile/
  ├─ All module outputs
  ├─ Progress tracking
  └─ Output: Visualizations, recommendations
```

---

## Implementation Architecture

### File Structure
```
chess-iq/
├── src/
│   ├── app/
│   │   ├── layout.tsx                    # Root layout
│   │   ├── page.tsx                      # Home/dashboard
│   │   ├── player/[username]/
│   │   │   ├── page.tsx                  # Player profile
│   │   │   ├── games/page.tsx            # Game library
│   │   │   ├── review/[gameId]/page.tsx  # Game review (Chess.com style)
│   │   │   ├── analysis/
│   │   │   │   ├── openings/page.tsx
│   │   │   │   ├── losses/page.tsx
│   │   │   │   └── tactics/page.tsx
│   │   │   └── puzzles/page.tsx          # Puzzle recommendation list
│   │   └── api/
│   │       ├── games/[username]/route.ts         # Fetch & analyze games
│   │       ├── game-review/route.ts              # Deep game analysis (POST)
│   │       ├── loss-patterns/[username]/route.ts # Get loss analysis
│   │       ├── opening-stats/[username]/route.ts # Opening analytics
│   │       ├── puzzles/recommend/route.ts        # Get puzzle recommendations
│   │       ├── puzzles/[id]/route.ts             # Individual puzzle & progress
│   │       └── stockfish/analyze/route.ts        # Position evaluation
│   │
│   ├── modules/
│   │   ├── game-review/
│   │   │   ├── analyzer.ts                # Core analysis logic
│   │   │   ├── blunder-detector.ts        # Blunder classification
│   │   │   └── tactical-themes.ts         # Tactical pattern recognition
│   │   ├── loss-analysis/
│   │   │   ├── pattern-matcher.ts
│   │   │   └── loss-classifier.ts
│   │   ├── opening-analysis/
│   │   │   ├── opening-statistics.ts
│   │   │   └── preparation-depth.ts
│   │   ├── puzzle-engine/
│   │   │   ├── recommender.ts
│   │   │   ├── sources/
│   │   │   │   ├── lichess.ts
│   │   │   │   ├── chessprogramming.ts
│   │   │   │   └── generated.ts
│   │   │   └── difficulty-calculator.ts
│   │   └── stockfish/
│   │       ├── engine.ts                 # Stockfish wrapper
│   │       ├── evaluator.ts
│   │       └── tablbase.ts              # Endgame tablebases
│   │
│   ├── components/
│   │   ├── game-review/
│   │   │   ├── MoveBoard.tsx             # Interactive board showing moves
│   │   │   ├── EvalGraph.tsx             # Eval graph across game
│   │   │   ├── MoveList.tsx              # Annotated move list
│   │   │   ├── TacticalThemes.tsx        # Show tactics in position
│   │   │   └── BlunderSummary.tsx
│   │   ├── analysis/
│   │   │   ├── OpeningBreakdown.tsx
│   │   │   ├── LossPatterns.tsx
│   │   │   ├── TacticalsStrengths.tsx
│   │   │   └── AccuracyChart.tsx
│   │   ├── puzzles/
│   │   │   ├── PuzzleBoard.tsx           # Interactive puzzle solver
│   │   │   ├── PuzzleList.tsx
│   │   │   ├── PuzzleProgress.tsx
│   │   │   └── RecommendationCards.tsx
│   │   └── shared/
│   │       ├── Chessboard.tsx
│   │       ├── PgnImport.tsx
│   │       └── PositionEvaluator.tsx
│   │
│   ├── lib/
│   │   ├── chess-com-api.ts              # Chess.com API wrapper
│   │   ├── game-analysis.ts              # Shared analysis utilities
│   │   ├── types.ts                      # Shared types/interfaces
│   │   ├── fen-parser.ts
│   │   └── pgn-parser.ts
│   │
│   └── db/
│       ├── migrations/                   # SQL migration files
│       └── migrations/
│
├── public/
│   └── piece-sets/                       # Chess piece SVGs
├── package.json
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── CLAUDE.md (this file)
```

### Key Directories Summary
| Dir | Purpose |
|-----|---------|
| `modules/` | Business logic for analysis, recommendations, engine |
| `components/` | React components grouped by feature area |
| `app/` | Next.js pages & API routes (thin routing layer) |
| `lib/` | Shared utilities, types, API wrappers |
| `db/` | Database schema & migrations |

---

## Database Schema (PostgreSQL with raw SQL via pg)

```typescript
// Core user & game data
model User {
  id: string;
  chesscomUsername: string;
  createdAt: DateTime;
  lastUpdated: DateTime;
  settings: UserSettings; // JSON

  profile: PlayerProfile;
  games: Game[];
  puzzleProgress: PuzzleProgress[];
}

model PlayerProfile {
  id: string;
  userId: string;

  // Cached analysis
  topLossReasons: LossReason[]; // Top 3-5
  strongOpenings: OpeningStats[];
  weakOpenings: OpeningStats[];
  tacticalWeaknesses: TacticalTheme[]; // Missed most
  tacticalStrengths: TacticalTheme[]; // Found most

  overallAccuracy: number;
  avgGameDuration: number;
  lastAnalyzedGameId: string;

  updatedAt: DateTime;
}

model Game {
  id: string;
  userId: string;
  chesscomGameId: string;
  pgn: string;

  // Chess.com metadata
  white: PlayerRef;
  black: PlayerRef;
  result: "1-0" | "0-1" | "1/2-1/2";
  timeControl: string;
  playedAt: DateTime;

  // Analysis cache
  analysisStatus: "pending" | "analyzing" | "complete";
  analyzedMove: AnalyzedMove[]; // Store detailed analysis
  blunders: Blunder[];
  lossTypes: LossReason[];
  openingEco: string;

  // For reviews
  evalGraph: EvalPoint[]; // Cached eval at each move
  criticalMoments: CriticalMoment[];

  createdAt: DateTime;
  updatedAt: DateTime;
}

model AnalyzedMove {
  id: string;
  gameId: string;
  moveNumber: number;

  move: string; // e.g. "e2e4"
  san: string;  // e.g. "e4"
  fen: string;
  engineEval: number; // Centipawns
  accuracy: number; // 0-100

  bestMove: string;
  tacticalThemes: TacticalTheme[]; // Available at this position

  createdAt: DateTime;
}

model Blunder {
  id: string;
  gameId: string;
  moveNumber: number;

  playerMove: string;
  bestMove: string;
  inaccuracySeverity: "inaccuracy" | "mistake" | "blunder";
  whatMissed: TacticalTheme; // What tactic was available
  consequence: string; // Lost 1.5 pieces, gave mate threat, etc.

  createdAt: DateTime;
}

model PuzzleRecommendation {
  id: string;
  userId: string;

  reason: "missed_tactic" | "opening_weakness" | "loss_pattern";
  relatedGames: string[]; // Which games triggered this
  tacticalThemes: TacticalTheme[];
  difficulty: number;

  puzzles: PuzzleInstance[];
  status: "active" | "completed" | "pending";

  createdAt: DateTime;
  expiresAt: DateTime; // Refresh recommendations periodically
}

model Puzzle {
  id: string;
  source: "lichess" | "chessprogramming" | "generated";
  sourceId: string;

  fen: string;
  bestMove: string;
  solutionMoves: string[];
  difficulty: number;
  tacticalThemes: TacticalTheme[];
  rating: number; // Lichess rating

  createdAt: DateTime;
}

model PuzzleProgress {
  id: string;
  userId: string;
  puzzleId: string;

  attempts: number;
  solved: boolean;
  timeSpent: number;

  firstAttemptAt: DateTime;
  solvedAt: DateTime;
}

// Supporting tables
model OpeningStats {
  id: string;
  userId: string;

  ecCode: string;
  name: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;

  byColor: {
    white: { wins, losses, draws, accuracy };
    black: { wins, losses, draws, accuracy };
  };

  topLossReasons: Record<LossReason, number>;
  tacticsMissed: Record<TacticalTheme, number>;

  updatedAt: DateTime;
}
```

---

## API Endpoints

### Game Data
```
GET  /api/games/[username]
  Query: months=6, format=json
  Returns: { games, lastSynced, totalAnalyzed }

POST /api/games/[username]/sync
  Triggers: Fetch new games from Chess.com, analyze them
  Returns: { newGamesCount, analysisProgress }
```

### Game Review (Deep Analysis)
```
POST /api/game-review
  Body: { pgn, depth=20 }
  Returns: {
    analysisStatus: "complete",
    moves: AnalyzedMove[],
    blunders: Blunder[],
    evalGraph: EvalPoint[],
    criticalMoments: CriticalMoment[],
    summary: {
      topErrors: TacticalTheme[],
      accuracy: number,
      worstMoveNumber: number
    }
  }
```

### Analysis
```
GET  /api/loss-patterns/[username]
  Returns: { topReasons, byOpening, byColor, trends }

GET  /api/opening-stats/[username]
  Returns: { allOpenings, strengthsByColor, recommendations }

GET  /api/tactical-profile/[username]
  Returns: { strengths, weaknesses, improvementAreas }
```

### Puzzle Recommendations
```
GET  /api/puzzles/recommend/[username]
  Query: count=10, difficulty=intermediate
  Returns: { recommendations: PuzzleRecommendation[], reason, relatedGames }

POST /api/puzzles/[puzzleId]/attempt
  Body: { move, correct }
  Returns: { correct, nextPuzzle, stats }

GET  /api/puzzles/progress/[username]
  Returns: { totalAttempted, solved, accuracy, tacticsMastered }
```

### Stockfish Analysis
```
POST /api/stockfish/analyze
  Body: { fen, depth=20, multiline=3 }
  Returns: { bestMove, eval, lines: [{ moves, eval }] }

POST /api/stockfish/tablebase
  Body: { fen }
  Returns: { wdl: [wins, draws, losses], dtz: number } // Endgame distances
```

---

## User Experience Flow

### 1. **Onboarding**
```
User enters Chess.com username
→ Fetch last 6 months of games
→ Queue analysis (happens in background)
→ Show dashboard with initial stats
→ As analysis completes, fill in deeper insights
```

### 2. **Game Review**
```
Click on game from library
→ Show board with first move
→ Display annotations as user plays through
→ Show eval graph, blunders highlighted
→ Interactive: Can analyze variations, see engine evals
→ Bottom panel: Tactical themes, move alternatives
→ Key insight panel: Why you lost, critical move numbers
```

### 3. **Loss Analysis Dashboard**
```
Charts showing:
  - Top loss reasons (pie chart)
  - Loss reasons by time control (bar chart)
  - Loss reasons by color (comparison)
  - Loss reasons by opening family (expandable tree)
→ Click on reason to see games where it happened
→ Drill into specific games for detailed analysis
```

### 4. **Opening Analytics**
```
White openings | Black openings (tabs)
→ Table showing: ECO, name, games, wins %, accuracy, top loss reasons
→ Click opening to see:
    - Games where you played it
    - Your main variations
    - Weak spots in your preparation
    - Recommended puzzles for that opening
```

### 5. **Puzzle Training**
```
User sees personalized "Learn & Improve" section:
  - "3 missed forks in your recent games → 5 puzzles"
  - "Black Sicilian weakness → 8 puzzles"
  - "Back rank mate patterns → 6 puzzles"

Click recommendation → Puzzle board opens
→ User tries to find best move
→ Shows solution with explanation
→ Tracks progress over time
→ Recommends next puzzle based on performance
```

### 6. **Progress Tracking**
```
Timeline showing:
  - Overall rating trends
  - Opening accuracy trends
  - Tactical weakness → mastery timeline
  - Top improvements (what you're getting better at)
  - Remaining weaknesses
```

---

## Next.js 16 Implementation Guide

⚠️ Next.js 16 has significant breaking changes. Always refer to `node_modules/next/dist/docs/` before writing any code. Key differences from older versions:

### App Router (Mandatory)
- Only App Router (`/src/app`) is supported — No Pages Router
- File structure: `app/[route]/page.tsx` for pages, `app/api/[route]/route.ts` for APIs
- Use `layout.tsx` for shared layouts

### Server vs Client Components
- **Server Components** (default): Use for data fetching, secrets, large dependencies
- **Client Components**: Add `"use client"` at top. Use for interactivity, hooks, context
- Root `layout.tsx` is a Server Component by default
- Mixing requires careful planning

### API Routes (`/src/app/api`)
- Files must export named HTTP method handlers: `GET`, `POST`, `PUT`, `DELETE`
- No request timeout limits (Railway runs a persistent Node process)
- Request/Response types: `NextRequest`, `NextResponse`
- Async params: `params: Promise<{...}>` — always await

### Rendering & Caching
- Static Rendering: Default for Server Components with no dynamic data
- `next: { revalidate: seconds }` in fetch: Set cache time (300s recommended for APIs)
- `revalidateTag()` & `revalidatePath()`: Invalidate specific cache entries
- Dynamic: Use `unstable_noStore()` or dynamic `searchParams`

---

## Frontend Architecture

### Component Organization
```
src/components/          # Reusable client/server components
  ├── Header.tsx        # Navigation & branding
  ├── [Section]/        # Feature-specific components
  │   ├── Chart.tsx
  │   └── Stats.tsx
  └── Common/           # Shared UI (buttons, cards, etc.)

src/app/                # Pages & API routes
  ├── layout.tsx        # Global layout
  ├── page.tsx          # Home page
  ├── player/
  │   └── [username]/page.tsx   # Player detail page
  └── api/
      └── games/[username]/route.ts    # Games data endpoint
```

### Component Best Practices

1. **Server vs Client Split**
   - Server Components (default): Fetch data, render static content
   - Client Components: Interactive features, useState, useEffect, context
   - Example: `GamesList.tsx` should be client (`"use client"` if interactive)

2. **Props & Typing**
   ```typescript
   interface PlayerChartProps {
     username: string;
     data: GameAnalysis[];
     isLoading?: boolean;
   }

   export function PlayerChart({ username, data, isLoading }: PlayerChartProps) {
     // Component logic
   }
   ```

3. **Avoid Props Drilling**
   - Use Context for deeply nested state (theme, user settings)
   - Pass callbacks via props for single-level interactions

4. **Performance Optimization**
   ```typescript
   // Use React.memo for expensive pure components
   const GameCard = React.memo(({ game }: GameCardProps) => {...});

   // Use useCallback for stable callback references
   const handleAnalyze = useCallback(() => {...}, [dependencies]);

   // Use useMemo for expensive computations
   const sortedGames = useMemo(() => games.sort(...), [games]);
   ```

### Styling with Tailwind CSS 4

- Use utility classes for responsive design
- Breakpoints: `sm:`, `md:`, `lg:`, `xl:`, `2xl:`
- Dark mode (`dark:`) — this project uses dark theme by default
- Gradients: `bg-gradient-to-r from-blue-400 to-emerald-400`
- Animations: `animate-pulse`, `animate-spin`, custom animations in config

**File Structure for Styles:**
- Global styles in `src/app/layout.tsx` or separate CSS file
- Component-scoped Tailwind classes in JSX
- No CSS Modules needed (Tailwind handles everything)

---

## Backend Architecture & API Routes

### API Route Pattern (`/src/app/api/[route]/route.ts`)

```typescript
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  // Always await params in Next.js 16
  const { username } = await params;
  const searchParams = request.nextUrl.searchParams;
  const months = parseInt(searchParams.get("months") ?? "6", 10);

  try {
    // Fetch data
    const data = await fetchSomeData(username, months);
    return NextResponse.json(data);
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}
```

### Data Fetching Strategy

1. **Client-Side Data Fetching**
   ```typescript
   "use client";

   import { useEffect, useState } from "react";

   export function PlayerStats({ username }: { username: string }) {
     const [data, setData] = useState(null);
     const [loading, setLoading] = useState(true);
     const [error, setError] = useState<string | null>(null);

     useEffect(() => {
       fetch(`/api/games/${username}?months=6`)
         .then(r => r.json())
         .then(setData)
         .catch(err => setError(err.message))
         .finally(() => setLoading(false));
     }, [username]);

     if (loading) return <div>Loading...</div>;
     if (error) return <div>Error: {error}</div>;
     return <div>{/* Render data */}</div>;
   }
   ```

2. **Server-Side Data Fetching** (use in Server Components)
   ```typescript
   async function getPlayerData(username: string) {
     const res = await fetch(`${BASE_URL}/player/${username}/stats`, {
       next: { revalidate: 300 }, // Cache for 5 minutes
     });
     return res.json();
   }

   export default async function PlayerPage() {
     const data = await getPlayerData(username);
     return <div>{/* Render */}</div>;
   }
   ```

### Caching Best Practices

- **Chess.com API**: Use `next: { revalidate: 300 }` (5 min cache) — data updates infrequently
- **Game Data**: Cache for shorter periods (60-180s) as games are frequently added
- **User Searches**: No cache needed (different users each time)
- Manual invalidation: Use `revalidateTag()` after mutations

---

## Chess.com API Integration

### Current Implementation (`src/lib/chess-com-api.ts`)

**Base URL:** `https://api.chess.com/pub`

**Key Endpoints:**
```typescript
// Player profile
GET /player/{username}
// Returns: ChessComProfile with avatar, location, joined date, etc.

// Player stats (current ratings)
GET /player/{username}/stats
// Returns: ChessComStats (bullet, blitz, rapid, daily ratings & records)

// Game archives (monthly)
GET /player/{username}/games/archives
// Returns: { archives: string[] } — URLs like /pub/player/{user}/games/2024/01

// Games for month
GET /pub/player/{username}/games/{year}/{month}
// Returns: { games: ChessComGame[] } with PGN, accuracies, times, etc.
```

### Best Practices

1. **Rate Limiting**
   - Chess.com allows ~500 requests per hour without explicit rate limiting
   - Implement exponential backoff on 429 responses
   - Cache aggressively (5+ minutes for profile data)

2. **Error Handling**
   ```typescript
   async function fetchJSON<T>(url: string): Promise<T> {
     const res = await fetch(url, {
       headers: { "User-Agent": "ChessCoach/1.0" },
       next: { revalidate: 300 },
     });

     if (!res.ok) {
       if (res.status === 404) throw new Error("Player not found");
       if (res.status === 429) throw new Error("Rate limit exceeded");
       throw new Error(`API error: ${res.status}`);
     }

     return res.json();
   }
   ```

3. **Fallback Data**
   - If a user hasn't played in a time period, `games` array will be empty
   - Handle empty archives gracefully (new accounts)
   - Show "No data available" states

---

## Game Analysis & Data Processing

### Current Implementation (`src/lib/game-analysis.ts`)

**Key Functions:**
- `parseAllGames()`: Parse raw PGN data into structured games
- `getOpeningStats()`: Extract opening families, win rates
- `getRatingHistory()`: Build rating timeline
- `getColorStats()`: Win rates by white/black
- `getTimeControlStats()`: Breakdown by bullet/blitz/rapid/daily
- `getStreaks()`: Current win/loss streaks
- `getResultBreakdown()`: Checkmate vs resignation vs timeout

### Best Practices for Analysis

1. **PGN Parsing** (using chess.js)
   ```typescript
   import { Chess } from "chess.js";

   const game = new Chess();
   game.loadPgn(pgnString);

   // Get all moves with position data
   const moves = game.moves({ verbose: true });

   // Access move details: move.san, move.piece, move.promotion, etc.
   ```

2. **Opening Detection**
   - Use ECO codes from Chess.com API (`game.eco` field)
   - Opening families: Grand Prix, Ruy Lopez, Sicilian, etc.
   - Calculate win rates per opening

3. **Performance Optimization**
   - Process games server-side (API route), return pre-computed stats
   - Cache analysis results in API response
   - Lazy-load detailed game analysis (load on demand, not by default)

---

## Stockfish Integration (Future)

### Setup (Not Yet Implemented)

1. **Installation:**
   ```bash
   npm install stockfish stockfish-nnue  # or use binary
   ```

2. **Server-Side Analysis** (recommended)
   ```typescript
   // src/lib/stockfish-engine.ts
   import Stockfish from "stockfish";

   let engine: Stockfish.StockfishType;

   export async function initEngine() {
     engine = await Stockfish();
     engine.postMessage("uci");
     // Wait for 'uciok'
   }

   export async function evaluatePosition(fen: string): Promise<number> {
     engine.postMessage(`position fen ${fen}`);
     engine.postMessage("go depth 20");
     // Parse output for score
   }
   ```

3. **API Route for Analysis**
   ```typescript
   // src/app/api/analyze/route.ts
   export async function POST(request: NextRequest) {
     const { fen } = await request.json();
     const evaluation = await evaluatePosition(fen);
     return NextResponse.json({ evaluation });
   }
   ```

4. **Usage in Frontend**
   ```typescript
   const analysis = await fetch("/api/analyze", {
     method: "POST",
     body: JSON.stringify({ fen: currentFen }),
   }).then(r => r.json());
   ```

**Stockfish Considerations:**
- Run on server only (WASM version for browser is slow)
- Set reasonable depth limits to avoid timeouts
- Cache evaluations (same position = same eval)
- Consider worker threads for CPU-intensive operations

---

## Performance & Optimization

### Image Optimization
- Use Next.js `Image` component for Chess.com avatars
- Set explicit width/height to prevent layout shift
- Use placeholder blur while loading

### Code Splitting
- Next.js auto-splits by route
- For large charts, use dynamic imports: `const Chart = dynamic(() => import("./Chart"))`

### Memoization Strategy
- Memoize expensive list renderers: `React.memo(GameCard)`
- Use `useMemo` for derived data: filtered games, sorted lists
- Use `useCallback` for event handlers passed to memoized children

### Bundle Size
- Current: Minimal dependencies (chess.js, recharts, date-fns)
- Avoid: moment.js, lodash (use date-fns, native array methods)
- Tree-shake: Import specific functions: `import { format } from "date-fns"`

---

## Error Handling & Validation

### Client-Side Validation
```typescript
function validateUsername(username: string): boolean {
  // Chess.com usernames: alphanumeric + hyphen, 1-200 chars
  return /^[\w-]{1,200}$/.test(username);
}
```

### API Error Responses
```typescript
// Standardized error response
return NextResponse.json(
  {
    error: "Player not found",
    code: "PLAYER_NOT_FOUND",
    details: { username, attempted_url }
  },
  { status: 404 }
);
```

### Try-Catch Patterns
```typescript
try {
  const data = await riskyOperation();
} catch (error) {
  if (error instanceof TypeError) {
    // Handle type errors (usually network/parsing)
  } else if (error?.message?.includes("not found")) {
    // Handle 404
  } else {
    console.error("Unexpected error:", error);
    throw error; // Re-throw if unhandled
  }
}
```

---

## Testing Strategy

### Unit Tests (Future)
- Test utility functions: `getRatingHistory()`, `getOpeningStats()`
- Mock Chess.com API responses
- Test PGN parsing edge cases

### Integration Tests
- Test API routes with mock data
- Verify caching behavior
- Test error scenarios (invalid username, rate limit)

### E2E Tests (Future)
- User flow: Search username → Load stats → View charts
- Interaction: Filter games, change time range
- Edge cases: Empty results, network errors

---

## Security Considerations

### Input Validation
- Validate username format before API calls
- Sanitize displayed usernames (prevent XSS)
- Use `encodeURIComponent()` for URL params

### API Security
- Chess.com API is public (no auth required)
- Our API routes are public (no sensitive data)
- Set appropriate CORS headers if needed
- Rate limit API requests server-side

### Secrets Management
- No secrets in client code (use `.env.local`)
- Define in `next.config.ts` if needed for builds
- Never commit `.env.local` (in `.gitignore`)

---

## Code Style & Conventions

### Naming Conventions
```typescript
// Components: PascalCase
export function PlayerCard() {}

// Variables/functions: camelCase
const playerName = "John Doe";
const calculateRating = (games) => {};

// Constants: UPPER_SNAKE_CASE
const MAX_GAMES_FETCH = 1000;
const API_BASE_URL = "https://api.chess.com/pub";

// Private/internal: leadingUnderscore (convention only)
function _parseInternalFormat(data) {}
```

### Type Annotations
```typescript
// Always annotate function returns
function getWinRate(games: ChessComGame[]): number {
  return games.filter(g => g.white.result === "win").length / games.length;
}

// Use interfaces for props
interface PlayerStatsProps {
  username: string;
  months?: number;
}

// Use type for unions
type TimeClass = "rapid" | "blitz" | "bullet" | "daily";
```

### Comments & Documentation
- Add comments for non-obvious logic
- Document API contracts (request/response shapes)
- Use JSDoc for exported functions

---

## Common Patterns & Examples

### Fetching Player Data
```typescript
async function loadPlayerAnalysis(username: string) {
  const response = await fetch(`/api/games/${username}?months=6`);
  if (!response.ok) throw new Error("Failed to load player");
  return response.json();
}
```

### Building Charts with Recharts
```typescript
<BarChart data={timeControlStats}>
  <CartesianGrid strokeDasharray="3 3" />
  <XAxis dataKey="name" />
  <YAxis />
  <Bar dataKey="wins" fill="#3b82f6" />
</BarChart>
```

### Filtering & Sorting Games
```typescript
const recentGames = games
  .filter(g => g.time_class === "blitz")
  .filter(g => new Date(g.end_time * 1000) > thirtyDaysAgo)
  .sort((a, b) => b.end_time - a.end_time);
```

---

## Deployment

### Railway (Production)
- Frontend: Next.js app served via `server.mjs` custom server
- Backend: Express + Stockfish in a separate Railway service (see `backend/`)
- Environment variables in Railway dashboard
- Auto-deploy on main branch push via Railway GitHub integration
- Cron jobs run via `setInterval` in `server.mjs` (not external scheduler)

### Build Process
```bash
npm run build  # Creates optimized Next.js build
npm start      # Runs production server (node server.mjs)
npm run dev    # Development server with HMR
```

### Performance Monitoring
- Sentry for error tracking and performance traces
- Railway dashboard for container metrics (CPU, memory, network)
- `/api/health` endpoint for uptime monitoring

---

## Debugging Tips

### Client-Side
- Use React DevTools browser extension
- Check Network tab for API call timing/response
- Check Console for client errors

### Server-Side
- Check terminal output during `npm run dev`
- Use the structured logger (`src/lib/logger.ts`) — JSON in production, readable in dev
- Sentry is configured for error tracking and performance monitoring

### PGN Parsing Issues
- Validate PGN format with chess.js before processing
- Log malformed games separately
- Check for variant games (Chess960, etc.)

---

## File Structure Reference

```
ChessIQ/
├── src/
│   ├── app/
│   │   ├── layout.tsx           # Root layout
│   │   ├── page.tsx             # Home page
│   │   ├── player/[username]/page.tsx   # Player detail
│   │   └── api/
│   │       └── games/[username]/route.ts  # Games API
│   ├── components/
│   │   ├── Header.tsx
│   │   ├── GamesList.tsx
│   │   ├── RatingChart.tsx
│   │   ├── AccuracyChart.tsx
│   │   ├── OpeningTable.tsx
│   │   ├── StatsCards.tsx
│   │   └── ... (other components)
│   └── lib/
│       ├── chess-com-api.ts     # Chess.com API wrapper
│       ├── game-analysis.ts     # Game processing logic
│       └── ... (utilities)
├── package.json
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── eslint.config.mjs
└── CLAUDE.md (this file)
```

---

## References

- [Next.js 16 Docs](https://nextjs.org/docs)
- [React 19 Docs](https://react.dev)
- [Chess.com Public API](https://www.chess.com/news/view/published-data-api)
- [Lichess API](https://lichess.org/api) - Puzzle source & alternative game data
- [chess.js Documentation](https://github.com/jhlywa/chess.js)
- [Stockfish](https://stockfishchess.org/) - UCI chess engine
- [Tailwind CSS](https://tailwindcss.com)
- [Recharts](https://recharts.org) - Chart library
- [Chessprogramming Wiki](https://www.chessprogramming.org/) - Tactical themes, eval functions
- [Lichess Puzzle Database](https://lichess.org/api#tag/Puzzles) - Millions of puzzles

---

## Stockfish Integration Strategy

### Why Server-Side Only
- **Browser Puzzle Solving**: ~20% speed (WASM) vs. 100% native
- **Game Analysis**: Depth 20+ takes minutes in WASM, seconds native
- **Tableba ses**: Can't load 500GB+ in browser
- **Solution**: Run engine on backend, send results to frontend

### Implementation
```typescript
// src/lib/stockfish/engine.ts
import { spawn } from "child_process";

class StockfishEngine {
  private process: ChildProcess;
  private depth: number = 20;

  async init() {
    this.process = spawn("stockfish");
    this.process.stdin.write("uci\n");
    // Wait for "uciok"
  }

  async analyze(fen: string, depth: number = 20): Promise<Analysis> {
    this.process.stdin.write(`position fen ${fen}\n`);
    this.process.stdin.write(`go depth ${depth}\n`);

    // Parse "bestmove ... ponder ..." output
    return parseEngineOutput();
  }

  async evaluateMultiline(fen: string, lines: number = 3): Promise<Line[]> {
    // Request multi-PV to get multiple best moves
    this.process.stdin.write(`setoption name MultiPV value ${lines}\n`);
    // Now analyze and get multiple lines
  }

  async tablebaseWDL(fen: string): Promise<WDLStats> {
    // Query 7-piece tablebase
    // Returns: [wins, draws, losses] from this position
  }
}

// API wrapper
export async function analyzeGamePosition(
  fen: string,
  depth: number = 20,
  wantMultiline: boolean = false
): Promise<{}> {
  const engine = new StockfishEngine();
  await engine.init();

  const mainEval = await engine.analyze(fen, depth);
  const alternatives = wantMultiline ? await engine.evaluateMultiline(fen, 3) : [];

  return { evaluate: mainEval.eval, bestMove: mainEval.bestMove, alternatives };
}
```

### Performance Optimization
```typescript
// Cache evaluations to avoid re-analyzing same positions
const evalCache = new Map<string, CachedEval>(); // fen -> eval

async function getCachedEval(fen: string, depth: number): Promise<Eval> {
  const key = `${fen}:${depth}`;
  const cached = evalCache.get(key);

  if (cached && Date.now() - cached.timestamp < 7 * 24 * 60 * 60 * 1000) {
    // Cache valid for 7 days
    return cached.eval;
  }

  const eval = await analyzeGamePosition(fen, depth);
  evalCache.set(key, { eval, timestamp: Date.now() });

  return eval;
}

// Also cache by game after analysis completes
// Don't re-evaluate same game twice
```

### For Game Review
- **Depth 20-25**: Reasonable accuracy without timeout (5-30s per position)
- **Critical positions**: Depth 30+ for the 5-10 most important moves
- **Moves near blunders**: Always deep analyze to understand what was missed
- **Strategy**: Analyze quickly first pass (depth 15), then deeper for critical moves

---

## Performance Considerations

### Game Analysis Bottlenecks
```
Sequential bottleneck:
  Download games → Parse PGNs → Analyze with Stockfish → Store results

Can be improved:
  - Download in parallel (Promise.all)
  - Parse in parallel (Worker threads)
  - Batch Stockfish evals (queue & process in order)
  - Store to DB in background job
```

### Caching Strategy
```typescript
// Analysis results: Cache indefinitely (game finished, analysis done)
// Opening stats: Cache 24 hours (only new games change it)
// Puzzle recommendations: Cache 7 days (re-fresh on new game analysis)
// Engine evals: Cache 7 days (same position = same eval at depth)

// When user uploads new games:
// 1. Invalidate puzzle recommendations cache (new weaknesses found)
// 2. Update opening stats cache
// 3. Update player profile cache
// Invalidate in this order to avoid stale data
```

### Database Indexing
```sql
-- Fast game lookups by user
CREATE INDEX idx_games_user_id ON games(user_id);

-- Fast opening stats queries
CREATE INDEX idx_opening_stats_user_id ON opening_stats(user_id);
CREATE INDEX idx_opening_stats_ec_code ON opening_stats(ec_code);

-- Fast blunder analysis by user
CREATE INDEX idx_blunders_game_id ON blunders(game_id);

-- Fast puzzle progress tracking
CREATE INDEX idx_puzzle_progress_user_id ON puzzle_progress(user_id, solved);
```

### API Response Compression
```typescript
// gzip compress large responses (eval graphs, move lists)
// Use streaming for large datasets (game analysis)

export async function GET(request: NextRequest) {
  const game = await getGameAnalysis(gameId);

  return new NextResponse(JSON.stringify(game), {
    headers: {
      "Content-Encoding": "gzip",
      "Cache-Control": "public, max-age=604800", // 7 days for completed analysis
    },
  });
}
```

### Frontend Performance
- **Lazy load game boards**: Don't render all moves at once, render on-demand
- **Virtualize long move lists**: Only render visible moves in the viewport
- **Memoize chart components**: Recharts charts re-render on every prop change
- **Code split by page**: game-review, puzzle-solver, analysis pages separate

---

## Security Considerations

### Input Validation
```typescript
// Validate PGN format
function validatePgn(pgn: string): boolean {
  // Must have [Event ...] tags
  // Move list must be valid (parseable by chess.js)
  // No executable code in annotations
  return true;
}

// Validate FEN (for position analysis)
function validateFen(fen: string): boolean {
  // Standard FEN format
  // No code injection attempts
  const chess = new Chess(fen);
  return !chess.isError(); // chess.js validates FEN
}

// Validate usernames
function validateUsername(username: string): boolean {
  return /^[\w-]{1,200}$/.test(username); // Chess.com format
}
```

### API Rate Limiting
```typescript
// Rate limit our own API to prevent abuse
// 100 requests per minute per IP for public endpoints
// 1000 requests/min for authenticated users

// Rate limit Chess.com API calls (they limit ~500/hr)
// Implement exponential backoff: 1s → 2s → 4s → 8s wait times
```

### Data Privacy
- User games are public (from Chess.com), but analysis is private
- Store analysis on server, don't expose to other users
- PII: Only store what Chess.com gives us (username, avatar)
- Delete old analysis caches periodically (6+ months old)

### Secrets Management
```typescript
// .env.local (never committed)
STOCKFISH_PATH=/path/to/stockfish
DATABASE_URL=postgresql://...
NEXTAUTH_SECRET=...

// Validate at startup
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL not set");
}
```

---

## Development Roadmap

### Phase 1: Core Platform (COMPLETE)
- ✅ Import games from Chess.com (auto-sync every 1 min)
- ✅ Stockfish deep analysis (depth 12-18, Railway backend)
- ✅ Move classification (brilliant, great, best, excellent, good, inaccuracy, mistake, blunder, miss, forced, book)
- ✅ Game review UI (Chess.com-style with eval bar, eval graph, move list, annotations)
- ✅ Loss pattern detection (tactical, opening, positional, outplayed categories + trend)
- ✅ Opening analytics (interactive board explorer, Lichess masters, personal stats, engine eval)
- ✅ User accounts & authentication (NextAuth, email/password, password reset)
- ✅ Dashboard (rating charts, accuracy charts, opening stats, game list, stats cards)
- ✅ Streaming game analysis with SSE progress
- ✅ Position eval caching (PostgreSQL)

### Phase 2: Intelligent Recommendations (COMPLETE)
- ✅ Puzzle curation engine (Lichess puzzle DB, 700K+ puzzles)
- ✅ Tactical weakness detection (12+ themes: fork, pin, skewer, etc.)
- ✅ Smart puzzle recommendations based on blunder patterns
- ✅ Puzzle solving tracker & progress UI
- ✅ Own-blunder puzzles (convert your mistakes into training positions)
- ✅ Blunder replay mode

### Phase 3: Advanced Analytics (IN PROGRESS)
- ✅ Phase-by-phase accuracy (opening/middlegame/endgame)
- ✅ Time pressure analysis (blunder rate by clock)
- ✅ Winning position conversion rate
- [ ] Critical moments detection (identify game turning points)
- [ ] Tactical profile page (per-theme accuracy, radar chart, improvement tracking)
- [ ] Opening preparation depth tracking (where book knowledge runs out)
- [ ] Progress timeline (tactical mastery, accuracy trends, puzzle rating history)
- [ ] Endgame tablebases (Lichess Syzygy API for ≤7-piece positions)
- [ ] Multi-PV alternative lines in game review
- [ ] Adaptive puzzle difficulty (Elo-based calibration)
- [ ] Puzzle recommendation cards (grouped by weakness theme)

---

## Team Guidelines for Consistency

### When Writing New Modules
1. **Thin routing layer**: API routes should be <50 lines, delegate to modules
2. **Extract types**: Define interfaces in `lib/types.ts` or module-specific `types.ts`
3. **Error handling**: Return meaningful error codes, never let errors bubble up
4. **Testing**: Write unit tests for analysis algorithms, integration tests for APIs
5. **Documentation**: JSDoc comments for exported functions, explain the *why*

### Code Review Checklist
- [ ] Uses appropriate module (game-review for blunders, loss-analysis for patterns, etc.)
- [ ] Types are exported & reusable
- [ ] Error messages are user-friendly
- [ ] Performance: No synchronous loops in async code
- [ ] Caching: Using appropriate cache duration
- [ ] Security: Input validated, no PGN injection possible

### Git Commit Messages
```
Format: [Module] Brief description
Examples:
  [analysis] Add back-rank mate detection to tactical themes
  [api] Implement puzzle recommendation caching
  [ui] Create game review board component
```

---

**Last Updated:** 2026-04-02
