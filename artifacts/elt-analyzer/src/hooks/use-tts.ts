import { useState, useRef, useCallback } from "react";

export type TTSState = "idle" | "loading" | "playing";

export function useTTS() {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [state, setState] = useState<TTSState>("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const cleanup = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
      audioRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  const toggle = useCallback(
    async (key: string, text: string) => {
      if (activeKey === key && state === "playing") {
        cleanup();
        setActiveKey(null);
        setState("idle");
        return;
      }

      cleanup();
      setActiveKey(key);
      setState("loading");

      try {
        const response = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });

        if (!response.ok) throw new Error("TTS 요청 실패");

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        objectUrlRef.current = url;

        const audio = new Audio(url);
        audioRef.current = audio;

        audio.onended = () => {
          cleanup();
          setActiveKey(null);
          setState("idle");
        };

        audio.onerror = () => {
          cleanup();
          setActiveKey(null);
          setState("idle");
        };

        setState("playing");
        await audio.play();
      } catch {
        cleanup();
        setActiveKey(null);
        setState("idle");
      }
    },
    [activeKey, state, cleanup]
  );

  const stop = useCallback(() => {
    cleanup();
    setActiveKey(null);
    setState("idle");
  }, [cleanup]);

  return { toggle, stop, activeKey, ttsState: state };
}
