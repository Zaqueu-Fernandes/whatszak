import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Paperclip, Image, FileText } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface AttachmentPickerProps {
  onFileSelected: (file: File, type: "image" | "video" | "file") => void;
  disabled?: boolean;
}

const VIDEO_EXTENSIONS = ["mp4", "mov", "webm", "mkv", "3gp", "avi", "m4v"];
const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "bmp"];

// The generic "Arquivo" picker (accept="*/*") is the only way to attach an
// existing video (there's no gallery video option, only live camera
// capture) — without this, a video picked there got message_type "file",
// which renders as a plain external-open link instead of playing inline
// (and, for view-once, completely bypassed the viewer's protections).
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

export default function AttachmentPicker({ onFileSelected, disabled }: AttachmentPickerProps) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFileSelected(file, "image");
          e.target.value = "";
        }}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="*/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFileSelected(file, classifyFile(file));
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
            <Paperclip className="h-5 w-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="min-w-[160px]">
          <DropdownMenuItem onClick={() => imageInputRef.current?.click()}>
            <Image className="mr-2 h-4 w-4 text-primary" />
            Foto
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
            <FileText className="mr-2 h-4 w-4 text-primary" />
            Arquivo
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
