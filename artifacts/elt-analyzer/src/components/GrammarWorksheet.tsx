import { Loader2, Printer, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGenerateGrammarWorksheet, type GrammarCard } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useRef } from "react";

interface GrammarWorksheetProps {
  topic: string;
  grammarSummary: string;
  originalText: string;
  cards?: GrammarCard[];
  onGenerated: (cards: GrammarCard[]) => void;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toParagraphs(value: string): string {
  return escapeHtml(value)
    .split(/\n+/)
    .filter(Boolean)
    .map((line) => `<p>${line}</p>`)
    .join("");
}

export function GrammarWorksheet({
  topic,
  grammarSummary,
  originalText,
  cards,
  onGenerated,
}: GrammarWorksheetProps) {
  const generation = useGenerateGrammarWorksheet();
  const { toast } = useToast();
  const grammarSegments = cards ?? [];
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  const handleGenerate = async () => {
    try {
      const data = await generation.mutateAsync({ data: { originalText, grammarSummary } });
      if (!active.current) return;
      onGenerated(data.cards);
      toast({ title: "문법 학습지 생성 완료", description: `${data.cards.length}개의 문법 카드를 만들었습니다. ‘문법 학습지’를 눌러 확인·인쇄하세요.` });
    } catch {
      if (!active.current) return;
      toast({ title: "문법 학습지 생성 실패", description: "설명과 예문을 완성하지 못했습니다. 잠시 후 다시 시도해주세요.", variant: "destructive" });
    }
  };

  const handlePrint = () => {
    const grammarCards = grammarSegments.map((segment, index) => {
      const examples = (segment.grammarExamples ?? [])
        .map((example) => `
          <li>
            <strong>${escapeHtml(example.sentence)}</strong>
            ${example.translation ? `<span>${escapeHtml(example.translation)}</span>` : ""}
          </li>`)
        .join("");

      return `
        <section class="grammar-card">
          <div class="card-title"><span>${index + 1}</span> 핵심 문법</div>
          <div class="explanation">${toParagraphs(segment.grammarNote ?? "")}</div>
          ${segment.grammarUsage?.trim() ? `<div class="usage">${toParagraphs(segment.grammarUsage)}</div>` : ""}
          <div class="source-example">
            <small>본문 속 문장</small>
            <strong>${escapeHtml(segment.phrase)}</strong>
          </div>
          ${examples ? `<div class="examples"><small>추가 예문</small><ul>${examples}</ul></div>` : ""}
          <div class="activity">□ 위 문법 표현을 아래 본문에서 찾아 밑줄을 그어 보세요.</div>
        </section>`;
    }).join("");

    const popup = window.open("", "_blank", "width=1000,height=800");
    if (!popup) {
      toast({ title: "팝업을 허용해주세요", description: "문법 학습지를 열려면 브라우저의 팝업 차단을 해제해주세요." });
      return;
    }

    popup.document.write(`<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>핵심 문법 학습지</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; color: #172033; font-family: Arial, "Apple SD Gothic Neo", sans-serif; background: #fff; }
    .page { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 15mm 16mm; }
    header { border-bottom: 3px solid #2563eb; padding-bottom: 12px; margin-bottom: 18px; }
    h1 { margin: 0 0 7px; font-size: 25px; }
    .subtitle { color: #526079; font-size: 13px; }
    .student { display: flex; gap: 28px; margin-top: 13px; font-size: 13px; }
    .line { display: inline-block; width: 120px; border-bottom: 1px solid #7b8494; height: 16px; }
    .guide { margin: 0 0 15px; padding: 10px 13px; background: #eff6ff; border-radius: 8px; color: #1e40af; font-size: 13px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .grammar-card { border: 1px solid #d8dee9; border-top: 4px solid #3b82f6; border-radius: 10px; padding: 13px; break-inside: avoid; }
    .grammar-card.full { grid-column: 1 / -1; }
    .card-title { color: #2563eb; font-size: 16px; font-weight: 700; margin-bottom: 9px; }
    .card-title span { display: inline-grid; place-items: center; width: 23px; height: 23px; border-radius: 50%; color: white; background: #2563eb; margin-right: 5px; }
    .explanation, .usage { font-size: 12.5px; line-height: 1.65; }
    .explanation p, .usage p { margin: 3px 0; }
    .usage { margin-top: 8px; padding: 8px 10px; background: #f8fafc; border-left: 3px solid #93c5fd; }
    small { display: block; color: #64748b; font-weight: 700; margin-bottom: 5px; }
    .source-example { margin-top: 10px; padding: 9px 10px; background: #fff7ed; border-radius: 7px; font-family: Georgia, serif; font-size: 13px; line-height: 1.45; }
    .examples { margin-top: 9px; font-size: 12px; }
    ul { margin: 0; padding-left: 18px; }
    li { margin: 4px 0; }
    li span { display: block; color: #64748b; margin-top: 2px; }
    .activity { margin-top: 11px; padding-top: 8px; border-top: 1px dashed #b8c1cf; color: #334155; font-size: 12px; font-weight: 700; }
    .passage { margin-top: 18px; border: 1px solid #cbd5e1; border-radius: 10px; padding: 14px; break-inside: avoid; }
    .passage h2 { margin: 0 0 8px; font-size: 17px; color: #1d4ed8; }
    .passage p { margin: 0; white-space: pre-wrap; font-family: Georgia, serif; font-size: 13px; line-height: 2; }
    .memo { margin-top: 14px; }
    .memo h2 { font-size: 15px; margin-bottom: 7px; }
    .memo-line { height: 26px; border-bottom: 1px solid #cbd5e1; }
    @page { size: A4; margin: 0; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .page { margin: 0; }
    }
  </style>
</head>
<body>
  <main class="page">
    <header>
      <h1>핵심 문법 학습지</h1>
      <div class="subtitle">${escapeHtml(topic || "본문 핵심 문법 정리")}</div>
      <div class="student"><span>이름 <i class="line"></i></span><span>날짜 <i class="line"></i></span></div>
    </header>
    <p class="guide">문법 설명과 예문을 공부한 뒤, 아래 본문에서 같은 문법 표현을 찾아 직접 밑줄을 그어 보세요.</p>
    <div class="grid">${grammarCards}</div>
    <section class="passage">
      <h2>본문에서 찾아보기</h2>
      <p>${escapeHtml(originalText || "본문 원문이 없습니다.")}</p>
    </section>
    <section class="memo">
      <h2>내가 찾은 문법 표현</h2>
      <div class="memo-line"></div><div class="memo-line"></div><div class="memo-line"></div>
    </section>
  </main>
</body>
</html>`);
    popup.document.close();
    popup.focus();
    window.setTimeout(() => popup.print(), 300);
  };

  return (
    <div className="flex flex-wrap items-center gap-2" aria-busy={generation.isPending}>
      <Button
        onClick={grammarSegments.length ? handlePrint : handleGenerate}
        disabled={generation.isPending || !originalText.trim()}
        variant="outline"
        className="gap-2 bg-blue-50/60 border-blue-200 text-blue-700 hover:bg-blue-100 hover:text-blue-800"
        data-testid="button-grammar-worksheet"
      >
        {generation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
        {generation.isPending ? "문법 카드 생성 중..." : grammarSegments.length ? "문법 학습지" : "문법 학습지 생성"}
      </Button>
      {grammarSegments.length > 0 && (
        <Button onClick={handleGenerate} disabled={generation.isPending} variant="outline" className="gap-2" data-testid="button-regenerate-grammar">
          <RefreshCw className="w-4 h-4" /> 문법 재생성
        </Button>
      )}
    </div>
  );
}