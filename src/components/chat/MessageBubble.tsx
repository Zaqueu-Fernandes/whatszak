import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { FileText, Download, Reply, Trash2, Share2, Forward, X, Eye, EyeOff, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resolveMediaUrl } from "@/lib/media";
import ViewOnceViewer from "./ViewOnceViewer";

interface ReplyInfo {
  id: string;
  content: string | null;
  messageType: string;
  senderName: string;
}

interface MessageBubbleProps {
  id: string;
  content: string | null;
  mediaUrl: string | null;
  messageType: string;
  isMine: boolean;
  createdAt: string;
  deleted: boolean;
  mediaExpired?: boolean;
  viewOnce?: boolean;
  viewedAt?: string | null;
  replyTo?: ReplyInfo | null;
  onReply: (id: string) => void;
  onDeleteForMe: (id: string) => void;
  onDeleteForAll: (id: string) => void;
  onForward: (id: string) => void;
  onShare: (id: string) => void;
  onViewOnceOpen?: (id: string) => void;
}

export default function MessageBubble({
  id,
  content,
  mediaUrl,
  messageType,
  isMine,
  createdAt,
  deleted,
  mediaExpired,
  viewOnce,
  viewedAt,
  replyTo,
  onReply,
  onDeleteForMe,
  onDeleteForAll,
  onForward,
  onShare,
  onViewOnceOpen,
}: MessageBubbleProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [locallyConsumed, setLocallyConsumed] = useState(false);
  const [resolvedMediaUrl, setResolvedMediaUrl] = useState<string | null>(null);
  const consumedRef = useRef(false);

  // mediaUrl stores the raw Storage path (or, for older messages, an already
  // pre-signed URL) rather than a ready-to-use link, so it can be re-signed
  // here on every view instead of expiring an hour after it was sent. Once a
  // view-once file has actually been opened, the message row's mediaUrl gets
  // updated to null (see markConsumed below) — ignore that so the
  // already-resolved URL keeps working for the viewer modal (still open at
  // that point) instead of the media vanishing out from under it.
  useEffect(() => {
    if (!mediaUrl) return;
    let cancelled = false;
    resolveMediaUrl(mediaUrl).then((url) => {
      if (!cancelled) setResolvedMediaUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [mediaUrl]);

  // View-once message that has already been viewed. `locallyConsumed` is set
  // synchronously by markConsumed below so the viewer sees the placeholder
  // immediately after closing the modal, without waiting on the realtime
  // round-trip for `viewedAt` to come back from the server.
  const isViewOnceConsumed = viewOnce && (!!viewedAt || locallyConsumed);
  // View-once media is never shown inline in the chat (for either side) —
  // only inside the full-screen ViewOnceViewer modal, so it can't be
  // screenshotted/forwarded/downloaded from the normal chat flow. Stays true
  // while the modal is still open even after consumption fires mid-viewing,
  // so the bubble behind the modal doesn't flip to rendering the raw media
  // inline (see the isViewOnceConsumed early-return's `!viewerOpen` guard).
  const showViewOnceGate = viewOnce && (!isViewOnceConsumed || viewerOpen);

  // Marks (and actually deletes, server-side) a view-once message as viewed
  // — but only once the media has genuinely loaded/played/opened inside the
  // viewer modal, not the instant it's opened. isMine is excluded: the
  // sender can still preview their own not-yet-viewed message without that
  // triggering deletion.
  const markConsumed = () => {
    if (!viewOnce || viewedAt || isMine || consumedRef.current) return;
    consumedRef.current = true;
    setLocallyConsumed(true);
    onViewOnceOpen?.(id);
  };

  // View-once consumed: show placeholder. Guarded by `!viewerOpen` — marking
  // consumed happens as soon as the media loads/plays *inside* the modal
  // (see markConsumed), which is well before the user is actually done
  // looking at/listening to it. Without this guard the component would
  // switch to this early-return branch immediately and unmount the modal
  // out from under them, closing it 1-2s into playback instead of when they
  // actually dismiss it.
  if (isViewOnceConsumed && !viewerOpen) {
    return (
      <div className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
        <div
          className={`max-w-[80%] rounded-lg px-3 py-2 shadow-sm ${
            isMine
              ? "bg-chat-bubble-sent rounded-tr-none"
              : "bg-chat-bubble-received rounded-tl-none"
          } opacity-60`}
        >
          <p className="text-sm italic text-muted-foreground flex items-center gap-1">
            <EyeOff className="h-3.5 w-3.5" /> Visualização única
          </p>
          <p className="text-[10px] mt-1 text-right text-muted-foreground">
            {format(new Date(createdAt), "HH:mm")}
          </p>
        </div>
      </div>
    );
  }

  if (deleted) {
    return (
      <div className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
        <div
          className={`max-w-[80%] rounded-lg px-3 py-2 shadow-sm ${
            isMine
              ? "bg-chat-bubble-sent rounded-tr-none"
              : "bg-chat-bubble-received rounded-tl-none"
          } opacity-60`}
        >
          <p className="text-sm italic text-muted-foreground">🚫 Mensagem apagada</p>
          <p className="text-[10px] mt-1 text-right text-muted-foreground">
            {format(new Date(createdAt), "HH:mm")}
          </p>
        </div>
      </div>
    );
  }

  const handleRevealViewOnce = () => {
    setViewerOpen(true);
  };

  const renderReplyPreview = () => {
    if (!replyTo) return null;
    const previewText =
      replyTo.messageType === "audio"
        ? "🎵 Áudio"
        : replyTo.messageType === "image"
        ? "📷 Imagem"
        : replyTo.messageType === "video"
        ? "🎥 Vídeo"
        : replyTo.messageType === "file"
        ? "📎 Arquivo"
        : replyTo.content ?? "";

    return (
      <div className="border-l-2 border-primary pl-2 mb-1 rounded bg-background/30 py-1 px-2">
        <p className="text-[11px] font-semibold text-primary">{replyTo.senderName}</p>
        <p className="text-[11px] text-muted-foreground truncate">{previewText}</p>
      </div>
    );
  };

  const renderContent = () => {
    if (mediaExpired && messageType !== "text") {
      return (
        <p className="text-sm italic text-muted-foreground flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" /> Mídia expirada
        </p>
      );
    }

    switch (messageType) {
      case "image":
        return (
          <div>
            {resolvedMediaUrl && (
              <img
                src={resolvedMediaUrl}
                alt="Imagem"
                className="max-w-full rounded-md mb-1 cursor-pointer"
                onClick={() => window.open(resolvedMediaUrl, "_blank")}
              />
            )}
            {content && <p className="text-sm break-words">{content}</p>}
          </div>
        );
      case "video":
        return (
          <div>
            {resolvedMediaUrl && (
              <video
                src={resolvedMediaUrl}
                controls
                className="max-w-full rounded-md mb-1"
              />
            )}
            {content && <p className="text-sm break-words">{content}</p>}
          </div>
        );
      case "audio":
        return (
          <div className="min-w-[200px]">
            {resolvedMediaUrl && (
              <audio controls className="w-full max-w-[250px]" preload="metadata">
                <source src={resolvedMediaUrl} type="audio/webm" />
              </audio>
            )}
          </div>
        );
      case "file":
        return (
          <a
            href={resolvedMediaUrl ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 p-2 rounded-md bg-background/50 hover:bg-background/80 transition-colors"
          >
            <FileText className="h-8 w-8 text-primary shrink-0" />
            <div className="flex-1 overflow-hidden">
              <p className="text-sm font-medium truncate">{content ?? "Arquivo"}</p>
            </div>
            <Download className="h-4 w-4 text-muted-foreground shrink-0" />
          </a>
        );
      default:
        return <p className="text-sm break-words">{content}</p>;
    }
  };

  const handleLongPress = () => setShowMenu(true);

  const handleAction = (action: () => void) => {
    action();
    setShowMenu(false);
  };

  return (
    <div className={`flex ${isMine ? "justify-end" : "justify-start"} relative`}>
      <div
        className={`max-w-[80%] rounded-lg px-3 py-2 shadow-sm ${
          isMine
            ? "bg-chat-bubble-sent rounded-tr-none"
            : "bg-chat-bubble-received rounded-tl-none"
        }`}
        onContextMenu={(e) => {
          e.preventDefault();
          setShowMenu(true);
        }}
        onTouchStart={() => {
          const timer = setTimeout(() => setShowMenu(true), 500);
          const clearTimer = () => clearTimeout(timer);
          document.addEventListener("touchend", clearTimer, { once: true });
          document.addEventListener("touchmove", clearTimer, { once: true });
        }}
      >
        {renderReplyPreview()}

        {showViewOnceGate ? (
          <button
            onClick={handleRevealViewOnce}
            className="flex flex-col items-center gap-1 py-3 px-6 w-full"
          >
            <Eye className="h-6 w-6 text-primary" />
            <span className="text-xs font-medium text-primary">Toque para visualizar</span>
            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
              <EyeOff className="h-3 w-3" /> Visualização única
            </span>
          </button>
        ) : (
          renderContent()
        )}

        <p className="text-[10px] mt-1 text-right text-muted-foreground">
          {format(new Date(createdAt), "HH:mm")}
        </p>
      </div>

      {viewerOpen && (
        <ViewOnceViewer
          mediaUrl={resolvedMediaUrl}
          messageType={messageType}
          content={content}
          onLoaded={markConsumed}
          onClose={() => setViewerOpen(false)}
        />
      )}

      {/* Context Menu */}
      {showMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
          <div
            className={`absolute z-50 ${isMine ? "right-0" : "left-0"} bottom-full mb-1 bg-card border border-border rounded-lg shadow-xl py-1 min-w-[180px]`}
          >
            <button
              className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted transition-colors text-foreground"
              onClick={() => handleAction(() => onReply(id))}
            >
              <Reply className="h-4 w-4" /> Responder
            </button>
            {!viewOnce && (
              <>
                <button
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted transition-colors text-foreground"
                  onClick={() => handleAction(() => onForward(id))}
                >
                  <Forward className="h-4 w-4" /> Encaminhar
                </button>
                <button
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted transition-colors text-foreground"
                  onClick={() => handleAction(() => onShare(id))}
                >
                  <Share2 className="h-4 w-4" /> Compartilhar
                </button>
              </>
            )}
            <div className="border-t border-border my-1" />
            <button
              className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted transition-colors text-foreground"
              onClick={() => handleAction(() => onDeleteForMe(id))}
            >
              <Trash2 className="h-4 w-4" /> Apagar para mim
            </button>
            {isMine && (
              <button
                className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-destructive/10 transition-colors text-destructive"
                onClick={() => handleAction(() => onDeleteForAll(id))}
              >
                <Trash2 className="h-4 w-4" /> Apagar para todos
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
