import { X } from "lucide-react";

interface AvatarViewerProps {
  name: string;
  avatarUrl: string;
  onClose: () => void;
}

// Full-screen profile photo view, WhatsApp-style — tap the avatar in a
// chat's header to see it large instead of just the small circle.
export default function AvatarViewer({ name, avatarUrl, onClose }: AvatarViewerProps) {
  return (
    <div
      className="fixed inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center gap-6"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white/80 hover:text-white p-2 rounded-full bg-white/10"
        aria-label="Fechar"
      >
        <X className="h-6 w-6" />
      </button>
      <img
        src={avatarUrl}
        alt={name}
        className="max-w-[85vw] max-h-[70vh] rounded-lg object-contain"
        onClick={(e) => e.stopPropagation()}
      />
      <p className="text-white text-lg font-semibold drop-shadow">{name}</p>
    </div>
  );
}
