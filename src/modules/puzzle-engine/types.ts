export interface EloChangeResult {
  ratingChange: number;
  newRating: number;
}

export interface PuzzleSelection {
  id: string;
  fen: string;
  moves: string;
  rating: number;
  themes: string[];
  openingTags: string[];
  moveCount: number;
}
