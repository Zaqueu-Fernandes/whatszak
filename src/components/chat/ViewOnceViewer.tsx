import { useEffect } from "react";
import { X } from "lucide-react";

interface ViewOnceViewerProps {
  mediaUrl: string | null;
  messageType: string;
  content: string | null;
  onClose: () => void;
  // Called once the media has genuinely loaded/played — the caller uses this
  // to mark the message viewed (and delete it server-side) only once it was
  // actually shown, not the instant the modal opens.
  onLoaded: () => void;
}

// Full-screen, share/forward/download-free viewer for view-once media. It's
// the only place this media is ever rendered — MessageBubble never shows it
// inline — so closing this is really the only way to "see" it, and once
// closed the underlying message flips to its "already viewed" placeholder.
export default function ViewOnceViewer({
  mediaUrl,
  messageType,
  content,
  onClose,
  onLoaded,
}: ViewOnceViewerProps) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white/80 hover:text-white p-2 rounded-full bg-white/10"
        aria-label="Fechar"
      >
        <X className="h-6 w-6" />
      </button>

      <div
        className="max-w-full max-h-full p-4"
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
      >
        {!mediaUrl ? (
          <p className="text-white/70 text-sm">Carregando...</p>
        ) : messageType === "image" ? (
          <img
            src={mediaUrl}
            alt="Imagem"
            draggable={false}
            className="max-w-full max-h-[85vh] object-contain select-none"
            onLoad={onLoaded}
          />
        ) : messageType === "video" ? (
          <video
            src={mediaUrl}
            autoPlay
            controls
            controlsList="nodownload noremoteplayback"
            disablePictureInPicture
            className="max-w-full max-h-[85vh]"
            onLoadedData={onLoaded}
          />
        ) : messageType === "audio" ? (
          <audio
            src={mediaUrl}
            autoPlay
            controls
            controlsList="nodownload noremoteplayback"
            className="w-72"
            onPlay={onLoaded}
          />
        ) : (
          // Generic files have no in-app preview — opening the link is the
          // only way to "view" one, so that's what counts as consuming it.
          <a
            href={mediaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 p-4 rounded-md bg-white/10 text-white max-w-xs"
            onClick={onLoaded}
          >
            {content ?? "Abrir arquivo"}
          </a>
        )}
      </div>
    </div>
  );
}
