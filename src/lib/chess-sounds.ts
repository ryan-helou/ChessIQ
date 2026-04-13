// Chess sound effects using pre-loaded Audio objects
// Falls back silently if audio is unavailable

type SoundName = "move" | "capture" | "correct" | "wrong";

const SOUNDS: Record<SoundName, string> = {
  move: "/sounds/move.mp3",
  capture: "/sounds/capture.mp3",
  correct: "/sounds/correct.mp3",
  wrong: "/sounds/wrong.mp3",
};

// Cache loaded Audio elements to avoid re-loading
const audioCache: Partial<Record<SoundName, HTMLAudioElement>> = {};

function getAudio(name: SoundName): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (!audioCache[name]) {
    try {
      const audio = new Audio(SOUNDS[name]);
      audio.preload = "auto";
      audioCache[name] = audio;
    } catch {
      return null;
    }
  }
  return audioCache[name] ?? null;
}

export function playSound(name: SoundName): void {
  const audio = getAudio(name);
  if (!audio) return;
  try {
    // Clone the audio node so overlapping sounds play correctly
    const clone = audio.cloneNode() as HTMLAudioElement;
    clone.volume = name === "correct" ? 0.7 : 0.85;
    clone.play().catch(() => {/* autoplay blocked — silent */});
  } catch {
    // Silent fail
  }
}

// Preload all sounds (call once on mount)
export function preloadSounds(): void {
  if (typeof window === "undefined") return;
  (Object.keys(SOUNDS) as SoundName[]).forEach(getAudio);
}
