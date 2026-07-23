import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Camera } from "lucide-react";

interface CameraCaptureProps {
  onCaptured: (file: File, type: "image" | "video") => void | Promise<void>;
  disabled?: boolean;
}

function classifyMedia(file: File): "image" | "video" {
  return file.type.startsWith("video/") ? "video" : "image";
}

// Forcing the native camera via `capture="environment"` proved unreliable
// on this Android WebView (kept falling back to the gallery/file chooser
// regardless of accept type — see project notes). Dropping `capture`
// entirely and letting Android's own picker sheet handle it gives a real
// "Camera" option alongside Gallery/Files, reliably. Supports multi-select;
// each file is sent sequentially since ChatScreen's send handlers guard
// against overlapping in-flight sends.
export default function CameraCapture({ onCaptured, disabled }: CameraCaptureProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={async (e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          for (const file of files) {
            await onCaptured(file, classifyMedia(file));
          }
        }}
      />
      <Button
        size="icon"
        variant="ghost"
        className="rounded-full h-10 w-10 text-muted-foreground"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        <Camera className="h-5 w-5" />
      </Button>
    </>
  );
}
