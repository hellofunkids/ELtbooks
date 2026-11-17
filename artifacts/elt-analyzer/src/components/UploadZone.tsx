import React, { useCallback, useRef } from "react";
import { UploadCloud, X, FileImage } from "lucide-react";
import { Button } from "@/components/ui/button";

interface UploadZoneProps {
  onFileSelect: (file: File) => void;
  previewUrl: string | null;
  onClear: () => void;
  isLoading: boolean;
}

export function UploadZone({ onFileSelect, previewUrl, onClear, isLoading }: UploadZoneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isLoading) return;
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) {
      onFileSelect(file);
    }
  }, [isLoading, onFileSelect]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (isLoading) return;
    const file = e.target.files?.[0];
    if (file && file.type.startsWith("image/")) {
      onFileSelect(file);
    }
  }, [isLoading, onFileSelect]);

  return (
    <div className="w-full">
      {previewUrl ? (
        <div className="relative rounded-xl border border-border bg-card overflow-hidden shadow-sm flex items-center justify-center bg-muted/20">
          <img 
            src={previewUrl} 
            alt="Upload preview" 
            className="max-h-[520px] w-auto max-w-full object-contain block"
          />
          <Button
            variant="secondary"
            size="icon"
            className="absolute top-4 right-4 rounded-full shadow-md hover:scale-105 transition-transform"
            onClick={onClear}
            disabled={isLoading}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      ) : (
        <div
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 sm:p-12 transition-all cursor-pointer flex flex-col items-center justify-center text-center gap-4 bg-card hover:bg-accent/50 ${
            isLoading ? "opacity-50 pointer-events-none" : "border-muted-foreground/30 hover:border-primary/50"
          }`}
        >
          <div className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-2">
            <UploadCloud className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground mb-1">이미지를 여기에 드래그하거나 클릭하세요</h3>
            <p className="text-sm text-muted-foreground">교재 페이지를 찍은 사진(JPG, PNG)을 올려주세요.</p>
          </div>
          <input
            type="file"
            className="hidden"
            accept="image/*"
            ref={fileInputRef}
            onChange={handleFileChange}
            disabled={isLoading}
          />
        </div>
      )}
    </div>
  );
}
