import { useState } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface SaveDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (textbook: string, pageLabel: string) => Promise<void>;
  existingTextbooks: string[];
}

export function SaveDialog({ open, onClose, onSave, existingTextbooks }: SaveDialogProps) {
  const [textbook, setTextbook] = useState("");
  const [pageLabel, setPageLabel] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!textbook.trim()) return;
    setSaving(true);
    try {
      await onSave(textbook, pageLabel);
      setTextbook("");
      setPageLabel("");
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Save className="w-4 h-4 text-primary" />
            분석 결과 저장
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <label className="block text-sm font-medium mb-1.5">
              교재명 <span className="text-destructive">*</span>
            </label>
            <input
              list="textbook-list"
              value={textbook}
              onChange={(e) => setTextbook(e.target.value)}
              placeholder="예: Smart Kids 5, 천재교육 영어 6학년"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm
                         placeholder:text-muted-foreground focus:outline-none focus:ring-2
                         focus:ring-primary/40 transition"
              autoFocus
            />
            <datalist id="textbook-list">
              {existingTextbooks.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
            {existingTextbooks.length > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                기존: {existingTextbooks.slice(0, 4).join(", ")}
                {existingTextbooks.length > 4 ? ` 외 ${existingTextbooks.length - 4}개` : ""}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">
              페이지 / 단원 <span className="text-muted-foreground font-normal">(선택)</span>
            </label>
            <input
              value={pageLabel}
              onChange={(e) => setPageLabel(e.target.value)}
              placeholder="예: p.24-25, Unit 3"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm
                         placeholder:text-muted-foreground focus:outline-none focus:ring-2
                         focus:ring-primary/40 transition"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            취소
          </Button>
          <Button onClick={handleSave} disabled={!textbook.trim() || saving} className="gap-2">
            {saving ? (
              <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              <Save className="w-3 h-3" />
            )}
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
