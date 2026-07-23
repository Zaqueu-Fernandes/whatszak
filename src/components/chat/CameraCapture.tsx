import { useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { Camera as CapacitorCamera, CameraResultType, CameraSource } from "@capacitor/camera";
import { Button } from "@/components/ui/button";
import { Camera as CameraIcon } from "lucide-react";

interface CameraCaptureProps {
  onCaptured: (file: File, type: "image" | "video") => void | Promise<void>;
  disabled?: boolean;
}

function classifyMedia(file: File): "image" | "video" {
  return file.type.startsWith("video/") ? "video" : "image";
}

async function webPathToFile(webPath: string, fileName: string, mimeType: string): Promise<File> {
  const response = await fetch(webPath);
  const blob = await response.blob();
  return new File([blob], fileName, { type: mimeType || blob.type });
}

// The HTML `capture` attribute (and, before that, a plain file input hoping
// the OS chooser would offer a camera option) both proved unreliable on
// this Android WebView — they kept falling back to the gallery/file
// chooser regardless. The only thing that reliably launches the real
// camera turned out to be the native @capacitor/camera plugin, which uses
// Android's camera intent directly instead of going through a WebView file
// input at all. It's photo-only (no official Capacitor video-recording
// plugin exists) — video is still sendable via the attachment picker's
// gallery, just not captured live from this button.
async function captureNativePhoto(onCaptured: CameraCaptureProps["onCaptured"]) {
  try {
    const photo = await CapacitorCamera.getPhoto({
      resultType: CameraResultType.Uri,
      source: CameraSource.Camera,
      quality: 85,
    });
    if (!photo.webPath) return;
    const ext = photo.format || "jpeg";
    const file = await webPathToFile(photo.webPath, `photo-${Date.now()}.${ext}`, `image/${ext}`);
    await onCaptured(file, "image");
  } catch (err) {
    // User cancelled the camera or denied permission — nothing to do.
    console.warn("[CameraCapture] native capture cancelled or failed:", err);
  }
}

export default function CameraCapture({ onCaptured, disabled }: CameraCaptureProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const isNative = Capacitor.isNativePlatform();

  return (
    <>
      {/* Web/PWA fallback only — the native app never uses this input, see
          captureNativePhoto above. */}
      {!isNative && (
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
      )}
      <Button
        size="icon"
        variant="ghost"
        className="rounded-full h-10 w-10 text-muted-foreground"
        disabled={disabled}
        onClick={() => (isNative ? captureNativePhoto(onCaptured) : inputRef.current?.click())}
      >
        <CameraIcon className="h-5 w-5" />
      </Button>
    </>
  );
}
