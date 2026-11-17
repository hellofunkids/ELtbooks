import { useState, useEffect, useRef } from "react";

function TypewriterLine({ text, delay, speed }: { text: string; delay: number; speed: number }) {
  const [displayed, setDisplayed] = useState("");
  const [started, setStarted] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setDisplayed("");
    setStarted(false);
    setDone(false);
    const t = setTimeout(() => setStarted(true), delay);
    return () => clearTimeout(t);
  }, [text, delay]);

  useEffect(() => {
    if (!started || done) return;
    if (displayed.length >= text.length) {
      setDone(true);
      return;
    }
    const t = setTimeout(() => {
      setDisplayed(text.slice(0, displayed.length + 1));
    }, speed);
    return () => clearTimeout(t);
  }, [started, displayed, text, done, speed]);

  const isKoreanPart = (s: string) =>
    (s.match(/[\uAC00-\uD7AF]/g) || []).length > s.length * 0.25;

  const renderWithColors = (str: string) => {
    if (str.includes("→")) {
      const idx = str.indexOf("→");
      const before = str.slice(0, idx + 1);
      const after = str.slice(idx + 1);
      return (
        <>
          <span className="text-foreground">{before}</span>
          <span className="text-red-500 font-semibold">{after}</span>
        </>
      );
    }
    if (isKoreanPart(str)) {
      return <span className="text-red-500 font-semibold">{str}</span>;
    }
    return <span className="text-foreground">{str}</span>;
  };

  return (
    <p className="leading-relaxed text-[15px] min-h-[1.6em]">
      {renderWithColors(displayed)}
      {!done && started && (
        <span className="inline-block w-0.5 h-[1em] bg-primary align-middle ml-0.5 animate-pulse" />
      )}
    </p>
  );
}

interface AnimatedGrammarSectionProps {
  content: string;
}

export function AnimatedGrammarSection({ content }: AnimatedGrammarSectionProps) {
  const [triggered, setTriggered] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTriggered(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const SPEED = 18;
  const LINE_GAP = 250;

  const lines = String(content ?? "").split("\n");

  let cumulativeDelay = 0;
  const lineDelays = lines.map((line) => {
    const d = cumulativeDelay;
    cumulativeDelay += line.length * SPEED + LINE_GAP;
    return d;
  });

  return (
    <div ref={ref} className="space-y-1">
      {triggered
        ? lines.map((line, i) => (
            <TypewriterLine
              key={i}
              text={line}
              delay={lineDelays[i]}
              speed={SPEED}
            />
          ))
        : lines.map((line, i) => (
            <p key={i} className="leading-relaxed text-[15px] text-transparent select-none min-h-[1.6em]">
              {line || "\u00A0"}
            </p>
          ))}
    </div>
  );
}
