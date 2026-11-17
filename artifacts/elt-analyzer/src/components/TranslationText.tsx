interface TranslationTextProps {
  content: string;
}

export function TranslationText({ content }: TranslationTextProps) {
  const lines = String(content ?? "").split("\n");

  return (
    <div className="space-y-1.5">
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-2" />;

        if (line.includes("→")) {
          const arrowIdx = line.indexOf("→");
          const english = line.slice(0, arrowIdx + 1);
          const korean = line.slice(arrowIdx + 1);
          return (
            <p key={i} className="leading-relaxed text-[15px]">
              <span className="text-muted-foreground">{english}</span>
              <span className="text-red-500 font-medium">{korean}</span>
            </p>
          );
        }

        const koreanCharCount = (line.match(/[\uAC00-\uD7AF]/g) || []).length;
        const isKoreanLine = koreanCharCount > line.length * 0.3;

        return (
          <p
            key={i}
            className={`leading-relaxed text-[15px] ${isKoreanLine ? "text-red-500 font-medium" : "text-muted-foreground"}`}
          >
            {line}
          </p>
        );
      })}
    </div>
  );
}
