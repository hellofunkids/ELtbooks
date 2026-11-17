import { useState, useRef, useCallback, useEffect } from "react";

export interface GrammarExample {
  sentence: string;
  translation: string;
}

export interface LessonSegment {
  phrase: string;
  explanation: string;
  grammarNote?: string;
  grammarUsage?: string;
  grammarExamples?: GrammarExample[];
}

export type PlayerState = "idle" | "loading" | "playing" | "paused" | "done";

export interface LessonPlayerOptions {
  speed: number;
  repeatCount: number;
}

async function fetchTTS(text: string, speed: number, signal: AbortSignal): Promise<Blob | null> {
  const response = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, speed }),
    signal,
  });
  if (!response.ok || signal.aborted) return null;
  return response.blob();
}

// Playback phases per segment:
// phrase → explanation → grammarNote (if any) → grammarUsage (if any) → next segment (or repeat)
type Phase = "phrase" | "explanation" | "grammarNote" | "grammarUsage";

export function useLessonPlayer(
  segments: LessonSegment[],
  options: LessonPlayerOptions
) {
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [playerState, setPlayerState] = useState<PlayerState>("idle");

  // Single persistent Audio element — keeps iOS autoplay permission across segments
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const speedRef = useRef(options.speed);
  const repeatCountRef = useRef(options.repeatCount);

  useEffect(() => { speedRef.current = options.speed; }, [options.speed]);
  useEffect(() => { repeatCountRef.current = options.repeatCount; }, [options.repeatCount]);

  // Create the single audio element once on mount
  useEffect(() => {
    audioRef.current = new Audio();
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
        audioRef.current = null;
      }
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, []);

  const cleanupAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      // Don't destroy the element — just clear src so we can reuse it
      audioRef.current.src = "";
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  const cleanup = useCallback(() => {
    cleanupAudio();
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, [cleanupAudio]);

  useEffect(() => {
    return () => { cleanup(); };
  }, [cleanup]);

  const playAudio = useCallback(
    (blob: Blob, onEnded: () => void, abort: AbortController): void => {
      // Revoke previous blob URL
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }

      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;

      const audio = audioRef.current;
      if (!audio) return;

      // Reuse the same element — iOS keeps autoplay permission
      audio.onended = null;
      audio.onerror = null;
      audio.src = url;
      audio.load();

      audio.onended = () => {
        if (!abort.signal.aborted) onEnded();
      };
      audio.onerror = () => {
        if (!abort.signal.aborted) setPlayerState("idle");
      };

      audio.play().catch(() => {
        if (!abort.signal.aborted) setPlayerState("idle");
      });
    },
    []
  );

  const playStep = useCallback(
    async (index: number, phase: Phase, repeatNum: number): Promise<void> => {
      if (index >= segments.length) {
        setPlayerState("done");
        setCurrentIndex(-1);
        return;
      }

      setCurrentIndex(index);
      setPlayerState("loading");

      const abort = new AbortController();
      abortRef.current = abort;

      const advance = () => {
        if (abort.signal.aborted) return;
        if (phase === "phrase") {
          playStep(index, "explanation", repeatNum);
        } else if (phase === "explanation") {
          const note = segments[index]?.grammarNote?.trim() ?? "";
          if (note) {
            playStep(index, "grammarNote", repeatNum);
          } else {
            const nextRepeat = repeatNum + 1;
            if (nextRepeat < repeatCountRef.current) {
              playStep(index, "phrase", nextRepeat);
            } else {
              playStep(index + 1, "phrase", 0);
            }
          }
        } else if (phase === "grammarNote") {
          const usage = segments[index]?.grammarUsage?.trim() ?? "";
          if (usage) {
            playStep(index, "grammarUsage", repeatNum);
          } else {
            const nextRepeat = repeatNum + 1;
            if (nextRepeat < repeatCountRef.current) {
              playStep(index, "phrase", nextRepeat);
            } else {
              playStep(index + 1, "phrase", 0);
            }
          }
        } else {
          const nextRepeat = repeatNum + 1;
          if (nextRepeat < repeatCountRef.current) {
            playStep(index, "phrase", nextRepeat);
          } else {
            playStep(index + 1, "phrase", 0);
          }
        }
      };

      try {
        const seg = segments[index];
        let text = "";

        if (phase === "phrase") {
          text = seg.phrase;
        } else if (phase === "explanation") {
          text = seg.explanation;
        } else if (phase === "grammarNote") {
          text = seg.grammarNote?.trim() ?? "";
          if (!text) { advance(); return; }
        } else {
          text = seg.grammarUsage?.trim() ?? "";
          if (!text) { advance(); return; }
        }

        const blob = await fetchTTS(text, speedRef.current, abort.signal);
        if (!blob || abort.signal.aborted) return;

        setPlayerState("playing");
        playAudio(blob, advance, abort);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") return;
        cleanup();
        setPlayerState("idle");
      }
    },
    [segments, playAudio, cleanup]
  );

  const start = useCallback(() => {
    cleanup();
    playStep(0, "phrase", 0);
  }, [playStep, cleanup]);

  const pause = useCallback(() => {
    if (audioRef.current && playerState === "playing") {
      audioRef.current.pause();
      setPlayerState("paused");
    }
  }, [playerState]);

  const resume = useCallback(() => {
    if (audioRef.current && playerState === "paused") {
      audioRef.current.play().catch(() => setPlayerState("idle"));
      setPlayerState("playing");
    }
  }, [playerState]);

  const stop = useCallback(() => {
    cleanup();
    setCurrentIndex(-1);
    setPlayerState("idle");
  }, [cleanup]);

  const jumpTo = useCallback(
    (index: number) => {
      cleanup();
      playStep(index, "phrase", 0);
    },
    [playStep, cleanup]
  );

  return { currentIndex, playerState, start, pause, resume, stop, jumpTo };
}
