# Stockfish Integration Research: Chess.com vs Lichess

## Executive Summary

Chess.com and Lichess represent two different architectural approaches to integrating Stockfish for game analysis:

- **Lichess**: Open-source, distributed volunteer computing model with fishnet
- **Chess.com**: Proprietary, centralized server-side analysis with pre-computation

Both provide instant analysis to users but employ different strategies for resource allocation, caching, and performance optimization.

---

## 1. Lichess Game Analysis Architecture

### 1.1 Distributed Analysis System: Fishnet

Lichess uses **fishnet**, a distributed volunteer-computing system that coordinates analysis work across multiple client machines:

**Architecture:**
```
User Game → Lichess Server → Analysis Job Queue
                              ↓
                        Fishnet Coordinator
                              ↓
            Volunteer Clients (CPU Farm)
                 Stockfish NNUE Analysis
                              ↓
                        Return Results
                              ↓
                  Cache in evalCache + DB
                              ↓
                    Display to User
```

**Key Components:**

1. **Fishnet Protocol**
   - Clients connect to Lichess via outgoing HTTP requests (no firewall issues)
   - Clients maintain persistent connection for job assignment
   - Two job queues: "user queue" (faster clients for urgent requests) and "system queue" (slower machines)
   - Jobs are batches of positions to analyze at a specific depth

2. **Volunteer Computing Model**
   - Anyone can run a Fishnet client on their machine
   - Lichess distributes analysis work to available clients
   - Uses Stockfish NNUE and Fairy-Stockfish (for variants)
   - Automatic CPU core detection: "uses about 64 MiB RAM per CPU core"

3. **Fault Tolerance**
   - Clients can disconnect/reconnect freely
   - Incomplete jobs are automatically reassigned
   - Results validated before use
   - Redundant analysis possible for critical positions

**Advantages:**
- Horizontal scalability through volunteer network
- Low infrastructure cost (donated computing power)
- Decentralized and resilient
- Always available analysis capacity

**Disadvantages:**
- Variable analysis speed (depends on volunteer availability)
- Network overhead for job distribution
- Potential delays during peak usage

### 1.2 Instant Analysis Feature

Lichess provides "Instant Analysis" on the analysis board:

**How It Works:**
- Real-time position evaluation as you navigate the board
- Uses cached evaluations from the evalCache module
- Falls back to Fishnet network if evaluation not cached
- WebSocket-based real-time updates to the client

**Data Flow:**
```
User clicks move → Check evalCache (MongoDB)
                      ↓
                  If found: Return cached eval (instant)
                      ↓
                  If not found: Queue analysis job
                      ↓
                  Fishnet analyzes at depth 25-30
                      ↓
                  Store in evalCache for future use
                      ↓
                  Send to user via WebSocket
```

### 1.3 Technology Stack

- **Backend**: Scala 3 with Play 2.8 framework
- **Database**: MongoDB (4.7+ billion games indexed)
- **Caching**: evalCache module for position evaluation caching
- **Search**: Elasticsearch for game searching
- **Real-time**: WebSocket + Redis for client communication
- **Engine**: Stockfish (NNUE) + Fairy-Stockfish (variants)

### 1.4 Analysis Caching Strategy

**evalCache Module:**
- Stores evaluated positions in MongoDB
- Key: Position FEN + depth + mode
- Value: Best moves, evaluation, principal variation, nodes searched
- Reused across all games globally (multiple users benefit from same analysis)
- Persistent caching: Evaluations cached indefinitely

**Benefits:**
- Same position analyzed once, reused forever
- Common opening positions evaluated only once
- Reduces volunteer computing load over time
- Enables instant analysis for common positions

---

## 2. Chess.com Game Analysis

### 2.1 Approach Overview

Chess.com provides "Computer Analysis" built into their platform. Information on their specific architecture is limited (proprietary), but based on public information:

**Characteristics:**
- Server-side analysis only
- Analysis happens on Chess.com infrastructure
- Likely pre-computed or on-demand with their own Stockfish cluster
- Results stored in their database
- Analysis available through game review feature

**Analysis Features:**
- Eval graph throughout the game
- Best moves suggested at each position
- Blunder detection and classification
- Accuracy percentage calculation
- Move annotations

### 2.2 Estimated Architecture

**Likely Implementation:**
```
Game Completion → Analysis Job Queue (server)
                        ↓
            Chess.com Stockfish Cluster
            (Multiple instances, cloud or on-prem)
                        ↓
              Depth 20-25 analysis per position
                        ↓
            Cache results in database (PostgreSQL/MySQL)
                        ↓
            Display in Game Review UI
```

**Analysis Characteristics:**
- Analysis triggered automatically when game completes or on-demand
- Depth limits likely around 20-25 (balance between speed and accuracy)
- Higher depth for critical positions (blunders, key tactical moments)
- Results cached indefinitely for completed games

### 2.3 Performance Considerations

**Advantages:**
- Consistent, predictable performance
- No dependency on volunteer computing
- Full control over depth and analysis parameters
- Can prioritize premium users

**Disadvantages:**
- Requires substantial infrastructure investment
- Limited scalability without significant hardware
- Can experience delays during peak demand
- All resources must be self-hosted

---

## 3. Technical Deep Dive: Stockfish Analysis

### 3.1 Analysis Depth and Performance

**Search Depth Fundamentals:**
- Depth measured in "plies" (half-moves)
- Deeper analysis = more accurate but exponentially slower
- Alpha-Beta pruning reduces node count: best case O(b^⌈n/2⌉) vs. worst case O(b^n)

**Practical Performance:**
- Branching factor in chess ≈ 35-40
- Depth 20: ~5-15 seconds per position (modern hardware)
- Depth 25: ~30-60 seconds per position
- Depth 30: ~5-15 minutes per position

**Depth Selection Trade-offs:**
| Depth | Time (1 position) | Accuracy | Typical Use |
|-------|-------------------|----------|-------------|
| 15 | 0.5-1 sec | Basic | Opening analysis, quick check |
| 20 | 5-15 sec | Good | Game analysis, most positions |
| 25 | 30-60 sec | Very Good | Critical positions, blunders |
| 30+ | 5-15 min | Excellent | Endgame, match preparation |

**Game Analysis Strategy:**
- Initial pass: Depth 15-20 for all positions (quick overview)
- Second pass: Depth 25-30 for positions marked as critical:
  - Blunders
  - Tactical exchanges
  - Endgame transitions
  - Positions with large evaluation swings

### 3.2 Stockfish NNUE Evaluation

**Neural Network Evaluation (NNUE):**
- Replaced classical hand-crafted evaluation in Stockfish 16+
- Modern architecture: 2-layer NNUE with 768 input features
- Evaluation speed: ~1-2 microseconds per position (CPU-based)
- NNUE is much faster than classical evaluation, enabling deeper analysis

**Search Algorithm:**
- Alpha-Beta pruning with iterative deepening
- Late Move Reductions (LMR): Reduce search on moves that appear bad
- Null Move Pruning: Skip analysis on obvious opponent blunders
- Singular Extensions: Deeper analysis on strongest moves
- Aspiration Windows: Only search within expected eval range

**UCI Protocol Output:**
```
info depth 20 seldepth 22 multipv 1 score cp 35 nodes 12345678 nps 1234567 tbhits 0 time 10000 pv e2e4 c7c5 ...

Fields:
- depth: Search depth in plies
- seldepth: Selective deepening (actual depth with extensions)
- score cp: Evaluation in centipawns (1 pawn = 100 cp)
- nodes: Number of positions evaluated
- time: Time taken in milliseconds
- pv: Principal Variation (best moves found)
```

### 3.3 Blunder Detection

**Classification:**
- **Blunder**: Position eval drops >250 cp
- **Mistake**: Position eval drops 100-250 cp
- **Inaccuracy**: Position eval drops 25-100 cp
- **Best Move**: Eval improves or maintains
- **Brilliant**: Sacrifices that are objectively winning

**Implementation:**
```
For each move:
  1. Analyze position BEFORE move (depth 20-25)
  2. Analyze position AFTER move (depth 20-25)
  3. Calculate eval swing
  4. Compare to best move eval
  5. Classify severity based on eval difference
```

---

## 4. Data Storage and Caching Strategies

### 4.1 Lichess Approach: evalCache Module

**Architecture:**
```typescript
interface CachedEval {
  fen: string;
  depth: number;
  multiPv?: number;

  // Results
  bestMoves: string[];
  evaluation: number; // Centipawns
  nodes: number;
  time: number;
  pv: string[]; // Principal variation

  // Metadata
  timestamp: Date;
  strength?: number; // Stockfish strength parameter (0-20)
}
```

**Storage:**
- MongoDB database (primary storage for 4.7B+ games)
- Global cache: shared across all users
- Indexed by FEN string for fast lookup
- Retention: Permanent (never expires)

**Benefits:**
- "Stockfish analysis only happens once per unique position"
- Amortization of analysis cost across millions of users
- Growing value over time (more cached positions = more instant analyses)

### 4.2 Chess.com Approach: Database Caching

**Estimated Storage per Game:**
```
Game record:
  - Game metadata: 500B
  - 40-50 moves
  - Per-move data:
    - FEN: 60B
    - Best move: 5B
    - Eval: 10B
    - Annotation: 100-200B

Total per game: ~10-15 KB
```

**Caching Strategy:**
- Store analysis results in relational database (PostgreSQL/MySQL)
- Index by game ID + move number for fast retrieval
- Indefinite retention (completed games never change)
- Optional pre-analysis for popular games or user games

### 4.3 General Caching Pattern for Analysis

**Recommended Schema:**
```sql
-- Games table
CREATE TABLE games (
  id UUID PRIMARY KEY,
  user_id UUID,
  white_player VARCHAR(255),
  black_player VARCHAR(255),
  pgn TEXT,
  result VARCHAR(10),
  created_at TIMESTAMP,
  analysis_status VARCHAR(20) -- pending, analyzing, complete
);

-- Analyzed moves (pre-computed)
CREATE TABLE analyzed_moves (
  id BIGSERIAL PRIMARY KEY,
  game_id UUID REFERENCES games(id),
  move_number INTEGER,
  fen VARCHAR(200),
  move VARCHAR(10),
  best_move VARCHAR(10),
  evaluation NUMERIC(6,2), -- Centipawns
  accuracy NUMERIC(5,2),
  principal_variation TEXT, -- Best line continuation
  tactical_themes JSONB, -- Array of identified tactics
  depth INTEGER,
  nodes BIGINT,
  time_ms INTEGER,

  UNIQUE(game_id, move_number),
  INDEX idx_game_id (game_id),
  INDEX idx_fen (fen) -- For position-based queries
);

-- Blunder tracking
CREATE TABLE blunders (
  id BIGSERIAL PRIMARY KEY,
  game_id UUID REFERENCES games(id),
  move_number INTEGER,
  player_move VARCHAR(10),
  best_move VARCHAR(10),
  eval_before NUMERIC(6,2),
  eval_after NUMERIC(6,2),
  severity VARCHAR(20), -- blunder, mistake, inaccuracy
  what_missed VARCHAR(100), -- Tactical theme: pin, fork, etc.

  UNIQUE(game_id, move_number),
  INDEX idx_game_id (game_id)
);

-- Position eval cache (global, like Lichess)
CREATE TABLE position_cache (
  id BIGSERIAL PRIMARY KEY,
  fen VARCHAR(200) UNIQUE,
  depth INTEGER,
  best_moves VARCHAR(500), -- JSON array
  evaluation NUMERIC(6,2),
  principal_variation TEXT,
  nodes BIGINT,
  cached_at TIMESTAMP DEFAULT NOW(),

  PRIMARY KEY (fen, depth)
);
```

---

## 5. Analysis Workflow: From Game Completion to User View

### 5.1 Lichess Workflow

```
User finishes game
  ↓
Lichess saves game to MongoDB
  ↓
Analysis job queued in fishnet
  ↓
Available Stockfish client picks up job
  (Delay: seconds to minutes, depends on volunteer availability)
  ↓
Stockfish analyzes all moves at depth 20-25
  ↓
Results sent back to Lichess
  ↓
Stored in evalCache (MongoDB)
  ↓
User can access analysis immediately
  (Subsequent views of same position use cache)
  ↓
[48 hours later] Games available for study/analysis
```

**Timing:**
- Game save: Immediate
- Analysis queue: Immediate
- Analysis execution: Variable (seconds to hours)
- Display: Real-time updates via WebSocket

### 5.2 Chess.com Workflow (Estimated)

```
User finishes game
  ↓
Chess.com saves game to database
  ↓
Analysis queued (immediate or delayed?)
  ↓
Stockfish cluster analyzes (depth 20-25 per position)
  (Depth 25-30 for critical positions)
  ↓
Results cached in PostgreSQL/MySQL
  ↓
Game Review page displays analysis
  (Usually available immediately or within minutes)
  ↓
Eval graph, best moves, blunders shown to user
```

**Timing:**
- Game save: Immediate
- Analysis: Seconds to minutes
- Display: Usually immediate on game review

### 5.3 Key Differences

| Aspect | Lichess | Chess.com |
|--------|---------|-----------|
| Analysis Model | Distributed volunteer | Centralized cluster |
| Timing | Variable (seconds to hours) | Consistent (seconds to minutes) |
| Cost | Low (volunteer) | High (infrastructure) |
| Scalability | Horizontal (more volunteers) | Vertical (more servers) |
| Cache Sharing | Global (all users) | Per-user (isolated) |
| Depth Limits | Flexible (any depth) | Fixed (20-25 default) |

---

## 6. User Experience: Viewing Analysis

### 6.1 Lichess Game Review
- Board display with moveable pieces
- Move annotations from cache
- Eval graph showing position evaluation over time
- Real-time "Instant Analysis" as you navigate
- Computer engine suggestions at each move
- Principal variation (best line) for key positions
- Takes advantage of global eval cache for instant view

### 6.2 Chess.com Game Review
- Similar board interface
- Pre-computed annotations displayed
- Eval graph showing game flow
- Accuracy percentages per move
- Blunder highlights
- Move suggestions
- Faster display since analysis is pre-computed

---

## 7. Performance Benchmarks & Real-World Constraints

### 7.1 Analysis Time per Game

**Typical Game Analysis (40 moves):**
- Depth 15: 0.5 minutes (quick overview)
- Depth 20: 3-5 minutes (standard analysis)
- Depth 25: 15-30 minutes (deep analysis)
- Depth 30: 2-4 hours (match preparation)

**For Lichess 100M+ games per month:**
- Need massive volunteer network OR accept slower analysis
- Their solution: Tiered analysis
  - User's own games: High priority, analyzed quickly
  - Other games: Analyzed when volunteers available

**For Chess.com millions of games:**
- Requires substantial server infrastructure
- Likely uses depth 20 for speed, depth 25-30 for critical positions
- Queuing system to manage load

### 7.2 Database Disk Usage

**Analysis Cache Growth:**
- Typical game: 40 moves × 100 bytes per analyzed move ≈ 4 KB
- Global position cache (unique FENs): Depends on analysis depth
  - 1M unique positions = ~200 MB (FEN + eval data)
  - 1B unique positions = ~200 GB

**Lichess Storage:**
- 4.7B games × ~50 KB average = ~235 TB raw games
- Position cache: Likely in TB range given their age & scale
- Using MongoDB with compression handles this

---

## 8. Key Implementation Insights for Chess IQ

### 8.1 Recommended Architecture for Chess IQ

Given our goals and constraints, recommend a **hybrid approach**:

```
┌─────────────────────────────────────────────┐
│          User Submits Games                 │
│      (Chess.com PGN Import)                 │
└──────────────┬──────────────────────────────┘
               ↓
        ┌─────────────────┐
        │ Game Processor  │
        │  (Next.js API)  │
        └────────┬────────┘
                 ↓
    ┌────────────────────────────┐
    │  Tier 1: Quick Analysis    │
    │   (Depth 15-20)            │
    │   - All moves              │
    │   - ~1-3 minutes per game  │
    └────────────┬───────────────┘
                 ↓
    ┌────────────────────────────┐
    │  Tier 2: Deep Analysis     │
    │   (Depth 25-30)            │
    │   - Critical positions     │
    │   - Blunders              │
    │   - Endgames              │
    │   - Tactical exchanges    │
    │   - Delayed (~5-30 min)   │
    └────────────┬───────────────┘
                 ↓
    ┌────────────────────────────┐
    │  Storage & Caching         │
    │  - PostgreSQL (analyzed)   │
    │  - Redis (position cache)  │
    │  - Hot cache (recent games)│
    └────────────┬───────────────┘
                 ↓
    ┌────────────────────────────┐
    │  Loss Pattern Detection    │
    │  - Tactical weaknesses     │
    │  - Blunder clustering      │
    │  - Opening-specific issues │
    └────────────────────────────┘
```

### 8.2 Server-Side vs Browser Analysis

**Decision: Server-side only** (as per CLAUDE.md guidance)

**Reasons:**
- WASM Stockfish is ~20% speed vs. native
- Game analysis needs Depth 20+ (unacceptable in browser)
- Multiple games = multiple Stockfish instances needed
- Caching benefit: Same position analyzed once, reused forever
- Browser can't maintain persistent Stockfish instance

### 8.3 Depth Limits Strategy

Recommended approach (balancing speed and accuracy):

```typescript
interface AnalysisConfig {
  // Tier 1: Quick pass on all moves
  quickDepth: 15,
  quickTimeout: 3000, // 3 seconds per position

  // Tier 2: Deep analysis on critical moves
  deepDepth: 25,
  deepTimeout: 10000, // 10 seconds per position

  // Critical positions flagged by:
  criticalPositions: [
    "blunder_likely", // Eval swing > 100 cp
    "tactical_opportunity", // Multiple candidate moves
    "endgame_transition",
    "check_or_checkmate",
    "capture_sequence"
  ]
}
```

### 8.4 Caching Strategy for Chess IQ

**Three-tier Cache:**

1. **Hot Cache (Redis)**: Last 100 positions analyzed
   - TTL: 24 hours
   - Serves: Current user's active analysis
   - Hit rate: 70%+ (same positions across games)

2. **Warm Cache (PostgreSQL)**: All analyzed positions for user
   - TTL: Indefinite
   - Serves: User's complete game library
   - Fast lookup by FEN

3. **Cold Cache (Position Cache)**: Global positions (future)
   - Optional: Share position evals across users (like Lichess)
   - TTL: Indefinite
   - Massively reduces analysis workload over time

### 8.5 Integration with Loss Pattern Detection

**Analysis produces:**
```typescript
interface AnalyzedGame {
  moves: AnalyzedMove[];
  blunders: Blunder[];
  criticalMoments: CriticalMoment[];

  // For loss analysis module
  primaryLossFactor?: string;
  tacticalThemesMissed: string[];
  timeManagementIssues?: TimeIssue[];
}
```

**Loss pattern module consumes:**
- Which tactical themes were missed (pins, forks, etc.)
- When blunders occurred (early/mid/endgame)
- Opening where blunder happened
- Time spent on move vs. position complexity

---

## 9. Database Schema Recommendations

### 9.1 Games Table

```sql
CREATE TABLE games (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  chess_com_id BIGINT UNIQUE,

  -- Game metadata
  pgn TEXT NOT NULL,
  time_control VARCHAR(50),
  result VARCHAR(10), -- "1-0", "0-1", "1/2-1/2"
  played_at TIMESTAMP,
  white_username VARCHAR(255),
  black_username VARCHAR(255),
  white_rating SMALLINT,
  black_rating SMALLINT,

  -- Opening info
  opening_eco VARCHAR(3),
  opening_name VARCHAR(255),

  -- Analysis status
  analysis_status VARCHAR(20), -- pending, quick_pass, deep_pass, complete
  analysis_started_at TIMESTAMP,
  analysis_completed_at TIMESTAMP,

  -- Cached results
  accuracy_white NUMERIC(5,2),
  accuracy_black NUMERIC(5,2),

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  INDEX idx_user_id (user_id),
  INDEX idx_chess_com_id (chess_com_id),
  INDEX idx_status (analysis_status)
);
```

### 9.2 Analyzed Moves Table

```sql
CREATE TABLE analyzed_moves (
  id BIGSERIAL PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  move_number SMALLINT NOT NULL,
  depth_analyzed SMALLINT NOT NULL, -- 15, 20, or 25

  -- Move data
  fen VARCHAR(200) NOT NULL,
  move VARCHAR(10) NOT NULL, -- UCI notation: e2e4
  san VARCHAR(10) NOT NULL, -- Standard: e4

  -- Analysis results
  best_move VARCHAR(10),
  principal_variation VARCHAR(1000), -- Continuation
  evaluation_cp SMALLINT, -- Centipawns
  accuracy NUMERIC(5,2), -- 0-100%

  -- Classification
  is_blunder BOOLEAN,
  is_mistake BOOLEAN,
  is_inaccuracy BOOLEAN,

  -- Tactical themes present at this position
  tactical_themes JSONB, -- ["pin", "fork", "back_rank"]

  -- Performance metrics
  nodes_searched BIGINT,
  analysis_time_ms SMALLINT,

  analyzed_at TIMESTAMP,

  CONSTRAINT unique_move UNIQUE(game_id, move_number, depth_analyzed),
  INDEX idx_game_id (game_id),
  INDEX idx_fen (fen)
);
```

### 9.3 Blunders Table

```sql
CREATE TABLE blunders (
  id BIGSERIAL PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  move_number SMALLINT NOT NULL,

  -- Move data
  player_move VARCHAR(10) NOT NULL,
  best_move VARCHAR(10) NOT NULL,

  -- Evaluation data
  eval_before_cp SMALLINT,
  eval_after_cp SMALLINT,
  eval_loss_cp SMALLINT,

  -- Classification
  severity VARCHAR(20), -- blunder, mistake, inaccuracy

  -- What was missed
  missed_tactic VARCHAR(100), -- pin, fork, skewer, etc.
  consequence TEXT, -- "Lost queen", "Allowed back rank mate", etc.

  -- Context
  opening_phase VARCHAR(20), -- opening, middlegame, endgame
  time_available_ms INT,

  created_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT unique_blunder UNIQUE(game_id, move_number),
  INDEX idx_game_id (game_id),
  INDEX idx_severity (severity)
);
```

### 9.4 Position Cache Table (Global)

```sql
CREATE TABLE position_evals (
  id BIGSERIAL PRIMARY KEY,

  -- Position
  fen VARCHAR(200) NOT NULL,
  depth SMALLINT NOT NULL,

  -- Analysis results
  best_moves VARCHAR(100), -- Top 3 moves
  best_move VARCHAR(10),
  evaluation_cp SMALLINT,
  principal_variation VARCHAR(500),
  nodes_searched BIGINT,

  -- Metadata
  cached_at TIMESTAMP DEFAULT NOW(),
  hits_count BIGINT DEFAULT 1, -- How many times reused

  CONSTRAINT unique_position UNIQUE(fen, depth),
  INDEX idx_fen (fen)
);
```

---

## 10. Implementation Roadmap

### Phase 1: Core Analysis (Weeks 1-3)
- [ ] Set up Stockfish engine wrapper (Node.js child_process)
- [ ] Implement quick-pass analysis (depth 15)
- [ ] Build analyzed_moves storage schema
- [ ] Cache results in PostgreSQL
- [ ] Display analysis in game review UI

### Phase 2: Deep Analysis & Caching (Weeks 4-5)
- [ ] Implement tier-2 deep analysis (depth 25)
- [ ] Build position cache (global Redis)
- [ ] Optimize for repeated positions
- [ ] Create analysis queue for background jobs

### Phase 3: Loss Pattern Integration (Weeks 6-7)
- [ ] Extract tactical themes from analyzed positions
- [ ] Build blunder classification
- [ ] Integrate with loss-analysis module
- [ ] Generate opening-specific insights

### Phase 4: Performance & Scaling (Weeks 8+)
- [ ] Benchmark analysis speed
- [ ] Implement worker threads for parallelization
- [ ] Add job queue for bulk analysis
- [ ] Optimize database queries

---

## 11. Key Technical Decisions Summary

| Decision | Rationale | Implication |
|----------|-----------|-------------|
| Server-side only | WASM is 20% speed; caching requires server | No browser analysis |
| PostgreSQL + Redis | Balanced performance/complexity | Fast lookup, good caching |
| Tiered analysis | Speed vs. accuracy trade-off | Immediate UI, deep analysis async |
| Per-user cache | Simpler implementation | Miss out on cross-user benefits (for now) |
| Depth 15-25 | Balance accuracy & speed | Good for improvement tracking |
| Store all analyzed moves | Enable loss pattern detection | ~5-10 KB per game |
| UCI protocol output | Standard, documented | Compatible with all engines |

---

## 12. References & Resources

**Lichess Research:**
- https://github.com/lichess-org/fishnet - Distributed analysis system
- https://github.com/lichess-org/lila - Main Lichess codebase (Scala)
- Technology: MongoDB (4.7B+ games), Scala 3, Play 2.8, Redis

**Stockfish & Chess Programming:**
- https://stockfishchess.org/ - Official Stockfish
- https://chessprogramming.org/ - Comprehensive chess programming reference
- https://github.com/official-stockfish/Stockfish - Source code

**Key Concepts:**
- UCI Protocol: Standard engine communication
- Alpha-Beta Pruning: Search tree optimization
- NNUE: Neural network evaluation (modern Stockfish)
- Transposition Tables: Position caching in engines
- Principal Variation: Best line found during analysis

---

## 13. Conclusion

**For Chess IQ**, the recommended approach is:

1. **Server-side Stockfish only** (depth 15-25, ~1-30 seconds per position)
2. **Tiered analysis** (quick pass on all moves, deep pass on critical)
3. **PostgreSQL + Redis caching** (per-user positions, with hot cache)
4. **Integrated with loss pattern detection** (blunder classification → weak area identification)
5. **Scalable from day 1** (can add distributed analysis like Lichess later)

This provides users with immediate feedback on their games while maintaining the ability to detect patterns and recommend targeted puzzles to address weaknesses.
