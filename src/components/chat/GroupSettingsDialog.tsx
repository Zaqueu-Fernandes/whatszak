import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Camera, X, Shield, ShieldOff, Lock } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface GroupSettingsDialogProps {
  chatId: string;
  currentUserId: string;
  currentName: string;
  currentAvatarUrl?: string | null;
  onlyAdminsCanMessage: boolean;
  isAdmin: boolean;
  onClose: () => void;
  onSaved: (name: string, avatarUrl: string | null, onlyAdminsCanMessage: boolean) => void;
}

interface Member {
  user_id: string;
  is_admin: boolean;
  name: string;
  avatar_url: string | null;
}

function initialsOf(name: string) {
  return (name || "?")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function GroupSettingsDialog({
  chatId,
  currentUserId,
  currentName,
  currentAvatarUrl,
  onlyAdminsCanMessage,
  isAdmin,
  onClose,
  onSaved,
}: GroupSettingsDialogProps) {
  const { user } = useAuth();
  const [name, setName] = useState(currentName);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(currentAvatarUrl ?? null);
  const [locked, setLocked] = useState(onlyAdminsCanMessage);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadMembers();
  }, [chatId]);

  const loadMembers = async () => {
    setLoadingMembers(true);
    const { data: participants } = await supabase
      .from("chat_participants")
      .select("user_id, is_admin")
      .eq("chat_id", chatId);

    const rows = (participants ?? []) as unknown as { user_id: string; is_admin: boolean }[];
    if (rows.length === 0) {
      setMembers([]);
      setLoadingMembers(false);
      return;
    }

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, name, avatar_url")
      .in("id", rows.map((r) => r.user_id));

    const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
    const merged: Member[] = rows
      .map((r) => ({
        user_id: r.user_id,
        is_admin: r.is_admin,
        name: profileMap.get(r.user_id)?.name ?? "Usuário",
        avatar_url: profileMap.get(r.user_id)?.avatar_url ?? null,
      }))
      .sort((a, b) => (a.is_admin === b.is_admin ? a.name.localeCompare(b.name) : a.is_admin ? -1 : 1));

    setMembers(merged);
    setLoadingMembers(false);
  };

  const handleAvatarPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user) return;

    setUploading(true);
    const ext = file.name.split(".").pop() ?? "jpg";
    // Stored under the uploader's own folder — the "avatars" bucket's
    // storage policies are owner-path-scoped (auth.uid() = foldername[1]),
    // not group-aware.
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
      .update({ name: name.trim(), avatar_url: avatarUrl, only_admins_can_message: locked })
      .eq("id", chatId);

    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Grupo atualizado" });
    onSaved(name.trim(), avatarUrl, locked);
    onClose();
  };

  const toggleAdmin = async (member: Member) => {
    setPromotingId(member.user_id);
    const { error } = await supabase.rpc("set_chat_admin", {
      _chat_id: chatId,
      _target_user_id: member.user_id,
      _is_admin: !member.is_admin,
    });
    setPromotingId(null);

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    setMembers((prev) =>
      prev
        .map((m) => (m.user_id === member.user_id ? { ...m, is_admin: !m.is_admin } : m))
        .sort((a, b) => (a.is_admin === b.is_admin ? a.name.localeCompare(b.name) : a.is_admin ? -1 : 1))
    );
    toast({ title: !member.is_admin ? `${member.name} agora é admin` : `${member.name} não é mais admin` });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60">
      <div className="w-full max-w-sm bg-card rounded-t-2xl sm:rounded-2xl flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
          <h3 className="font-semibold text-foreground">Informações do grupo</h3>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto">
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => isAdmin && fileInputRef.current?.click()}
              className="relative"
              disabled={uploading || !isAdmin}
            >
              <Avatar className="h-24 w-24">
                <AvatarImage src={avatarUrl ?? undefined} />
                <AvatarFallback className="bg-primary/20 text-primary text-2xl">{initialsOf(name)}</AvatarFallback>
              </Avatar>
              {isAdmin && (
                <span className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
                  <Camera className="h-4 w-4" />
                </span>
              )}
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

          {isAdmin ? (
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
          ) : (
            <p className="text-center text-lg font-semibold">{name}</p>
          )}

          {isAdmin && (
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-muted-foreground" />
                <div>
                  <Label htmlFor="lock-toggle" className="text-sm">Somente admins enviam mensagens</Label>
                  <p className="text-xs text-muted-foreground">Demais membros só conseguem visualizar.</p>
                </div>
              </div>
              <Switch id="lock-toggle" checked={locked} onCheckedChange={setLocked} />
            </div>
          )}

          {!isAdmin && onlyAdminsCanMessage && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground bg-muted rounded-lg p-2">
              <Lock className="h-3.5 w-3.5 shrink-0" /> Somente administradores podem enviar mensagens neste grupo.
            </p>
          )}

          <div className="space-y-1.5">
            <Label className="text-sm text-muted-foreground">
              {members.length} participante{members.length !== 1 ? "s" : ""}
            </Label>
            {loadingMembers ? (
              <div className="flex justify-center py-4">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : (
              <div className="space-y-1">
                {members.map((member) => (
                  <div key={member.user_id} className="flex items-center gap-3 py-1.5">
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={member.avatar_url ?? undefined} />
                      <AvatarFallback className="bg-primary/20 text-primary text-xs">
                        {initialsOf(member.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {member.name}
                        {member.user_id === currentUserId && " (você)"}
                      </p>
                      {member.is_admin && <p className="text-xs text-primary">Admin</p>}
                    </div>
                    {isAdmin && member.user_id !== currentUserId && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs h-7"
                        disabled={promotingId === member.user_id}
                        onClick={() => toggleAdmin(member)}
                      >
                        {member.is_admin ? (
                          <><ShieldOff className="h-3.5 w-3.5 mr-1" /> Remover admin</>
                        ) : (
                          <><Shield className="h-3.5 w-3.5 mr-1" /> Tornar admin</>
                        )}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {isAdmin && (
            <Button
              className="w-full"
              onClick={handleSave}
              disabled={saving || uploading || !name.trim()}
            >
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
