import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Camera, Image, Video } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface CameraCaptureProps {
  onCaptured: (file: File, type: "image" | "video") => void;
  disabled?: boolean;
}

export default function CameraCapture({ onCaptured, disabled }: CameraCaptureProps) {
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      {/* Two single-purpose inputs, not one with accept="image/*,video/*" —
          Android's WebView only reliably jumps straight into the native
          camera (skipping the gallery/file-chooser fallback) when the accept
          type is unambiguous. */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onCaptured(file, "image");
          e.target.value = "";
        }}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onCaptured(file, "video");
          e.target.value = "";
        }}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className="rounded-full h-10 w-10 text-muted-foreground"
            disabled={disabled}
          >
            <Camera className="h-5 w-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="min-w-[160px]">
          <DropdownMenuItem onClick={() => photoInputRef.current?.click()}>
            <Image className="mr-2 h-4 w-4 text-primary" />
            Foto
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => videoInputRef.current?.click()}>
            <Video className="mr-2 h-4 w-4 text-primary" />
            Vídeo
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
