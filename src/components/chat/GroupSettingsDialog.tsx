import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Camera, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface GroupSettingsDialogProps {
  chatId: string;
  currentName: string;
  currentAvatarUrl?: string | null;
  onClose: () => void;
  onSaved: (name: string, avatarUrl: string | null) => void;
}

export default function GroupSettingsDialog({
  chatId,
  currentName,
  currentAvatarUrl,
  onClose,
  onSaved,
}: GroupSettingsDialogProps) {
  const { user } = useAuth();
  const [name, setName] = useState(currentName);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(currentAvatarUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const initials = (name || "Grupo")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const handleAvatarPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user) return;

    setUploading(true);
    const ext = file.name.split(".").pop() ?? "jpg";
    // Stored under the uploader's own folder — the "avatars" bucket's
    // storage policies are owner-path-scoped (auth.uid() = foldername[1]),
    // not group-aware, and groups don't have a separate ownership concept
    // in this app (any participant can already rename/re-photo a group,
    // same as chats_update's RLS already allows).
    const path = `${user.id}/group-${chatId}-${Date.now()}.${ext}`;

    const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (error) {
      toast({ title: "Erro no upload", description: error.message, variant: "destructive" });
      setUploading(false);
      return;
    }

    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    setAvatarUrl(data.publicUrl);
    setUploading(false);
  };

  const handleSave = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);

    const { error } = await supabase
      .from("chats")
      .update({ name: name.trim(), avatar_url: avatarUrl })
      .eq("id", chatId);

    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Grupo atualizado" });
    onSaved(name.trim(), avatarUrl);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60">
      <div className="w-full max-w-sm bg-card rounded-t-2xl sm:rounded-2xl flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-semibold text-foreground">Informações do grupo</h3>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="p-4 space-y-4">
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="relative"
              disabled={uploading}
            >
              <Avatar className="h-24 w-24">
                <AvatarImage src={avatarUrl ?? undefined} />
                <AvatarFallback className="bg-primary/20 text-primary text-2xl">{initials}</AvatarFallback>
              </Avatar>
              <span className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
                <Camera className="h-4 w-4" />
              </span>
              {uploading && (
                <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40">
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                </span>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarPick}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="group-name">Nome do grupo</Label>
            <Input
              id="group-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              placeholder="Nome do grupo"
            />
          </div>

          <Button
            className="w-full"
            onClick={handleSave}
            disabled={saving || uploading || !name.trim()}
          >
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
