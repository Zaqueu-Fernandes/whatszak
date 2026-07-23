import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Paperclip } from "lucide-react";

interface AttachmentPickerProps {
  onFileSelected: (file: File, type: "image" | "video" | "file") => void | Promise<void>;
  disabled?: boolean;
}

const VIDEO_EXTENSIONS = ["mp4", "mov", "webm", "mkv", "3gp", "avi", "m4v"];
const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "bmp"];

// file.type is usually reliable but can be blank from some mobile file
// pickers, hence the extension fallback.
function classifyFile(file: File): "image" | "video" | "file" {
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("image/")) return "image";
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext && VIDEO_EXTENSIONS.includes(ext)) return "video";
  if (ext && IMAGE_EXTENSIONS.includes(ext)) return "image";
  return "file";
}

// One tap goes straight to the gallery/media picker, WhatsApp-style — no
// "Foto"/"Arquivo" menu in between. Supports multi-select; each file is
// sent sequentially (awaited one at a time) since ChatScreen's send
// handlers guard against overlapping in-flight sends.
export default function AttachmentPicker({ onFileSelected, disabled }: AttachmentPickerProps) {
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
            await onFileSelected(file, classifyFile(file));
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
        <Paperclip className="h-5 w-5" />
      </Button>
    </>
  );
}
