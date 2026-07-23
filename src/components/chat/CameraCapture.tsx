import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Camera } from "lucide-react";

interface CameraCaptureProps {
  onCaptured: (file: File, type: "image" | "video") => void;
  disabled?: boolean;
}

export default function CameraCapture({ onCaptured, disabled }: CameraCaptureProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      {/* accept covers both so the native camera app itself offers the
          photo/video mode switch, same as WhatsApp's single camera button;
          capture="environment" skips the gallery and opens the camera directly. */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onCaptured(file, file.type.startsWith("video/") ? "video" : "image");
          e.target.value = "";
        }}
      />
      <Button
        size="icon"
        variant="ghost"
        className="rounded-full h-10 w-10 text-muted-foreground"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
      >
        <Camera className="h-5 w-5" />
      </Button>
    </>
  );
}
