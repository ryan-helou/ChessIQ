import { NextRequest, NextResponse } from "next/server";

// ─── LRU Cache (max 1000 entries) ───

interface CacheEntry {
  value: TablebaseResponse;
  prev: string | null;
  next: string | null;
}

const cache = new Map<string, CacheEntry>();
let head: string | null = null; // most recently used
let tail: string | null = null; // least recently used
const MAX_CACHE = 1000;

function cacheGet(key: string): TablebaseResponse | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  // Move to head (most recently used)
  if (head !== key) {
    // Remove from current position
    if (entry.prev) {
      const prevEntry = cache.get(entry.prev)!;
      prevEntry.next = entry.next;
    }
    if (entry.next) {
      const nextEntry = cache.get(entry.next)!;
      nextEntry.prev = entry.prev;
    }
    if (tail === key) {
      tail = entry.prev;
    }
    // Insert at head
    entry.prev = null;
    entry.next = head;
    if (head) {
      const oldHead = cache.get(head)!;
      oldHead.prev = key;
    }
    head = key;
    if (!tail) tail = key;
  }
  return entry.value;
}

function cacheSet(key: string, value: TablebaseResponse): void {
  if (cache.has(key)) {
    cache.get(key)!.value = value;
    cacheGet(key); // move to head
    return;
  }
  // Evict LRU if at capacity
  if (cache.size >= MAX_CACHE && tail) {
    const evictKey = tail;
    const evictEntry = cache.get(evictKey)!;
    tail = evictEntry.prev;
    if (tail) {
      cache.get(tail)!.next = null;
    } else {
      head = null;
    }
    cache.delete(evictKey);
  }
  // Insert at head
  const entry: CacheEntry = { value, prev: null, next: head };
  if (head) {
    cache.get(head)!.prev = key;
  }
  head = key;
  if (!tail) tail = key;
  cache.set(key, entry);
}

// ─── Helpers ───

interface TablebaseResponse {
  category: "win" | "draw" | "loss" | null;
  dtz: number | null;
  bestMove: string | null;
}

function countPieces(fen: string): number {
  const board = fen.split(" ")[0];
  let count = 0;
  for (const ch of board) {
    if (ch !== "/" && !/\d/.test(ch)) {
      count++;
    }
  }
  return count;
}

function isValidFen(fen: string): boolean {
  const parts = fen.trim().split(/\s+/);
  return parts.length === 6;
}

// ─── Route Handler ───

export async function GET(request: NextRequest) {
  const fen = request.nextUrl.searchParams.get("fen");

  if (!fen) {
    return NextResponse.json(
      { error: "Missing fen query parameter" },
      { status: 400 }
    );
  }

  if (!isValidFen(fen)) {
    return NextResponse.json(
      { error: "Invalid FEN: must have 6 space-separated parts" },
      { status: 400 }
    );
  }

  const pieceCount = countPieces(fen);
  if (pieceCount > 7) {
    return NextResponse.json(
      { error: "Position has too many pieces for tablebase lookup" },
      { status: 400 }
    );
  }

  // Check cache
  const cached = cacheGet(fen);
  if (cached) {
    return NextResponse.json(cached);
  }

  // Fetch from Lichess Syzygy API with 5s timeout
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const url = `https://tablebase.lichess.ovh/standard?fen=${encodeURIComponent(fen)}`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });

    clearTimeout(timeout);

    if (!res.ok) {
      // Lichess API error — return graceful fallback
      const fallback: TablebaseResponse = { category: null, dtz: null, bestMove: null };
      return NextResponse.json(fallback);
    }

    const data = await res.json();

    const result: TablebaseResponse = {
      category: data.category ?? null,
      dtz: data.dtz ?? null,
      bestMove:
        Array.isArray(data.moves) && data.moves.length > 0
          ? data.moves[0].uci ?? null
          : null,
    };

    // Cache the result
    cacheSet(fen, result);

    return NextResponse.json(result);
  } catch {
    clearTimeout(timeout);
    // Network error or timeout — return graceful fallback
    const fallback: TablebaseResponse = { category: null, dtz: null, bestMove: null };
    return NextResponse.json(fallback);
  }
}
