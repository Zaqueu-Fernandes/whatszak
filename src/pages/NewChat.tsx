import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, Search, Users, Check } from "lucide-react";

interface UserProfile {
  id: string;
  name: string;
  avatar_url: string | null;
}

export default function NewChat() {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [groupMode, setGroupMode] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const navigate = useNavigate();

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("id, name, avatar_url")
      .neq("id", user?.id ?? "");

    if (data) setUsers(data);
    setLoading(false);
  };

  const startChat = async (otherUserId: string) => {
    if (!user || creating) return;
    setCreating(true);

    const { data: chatId, error } = await supabase
      .rpc("create_private_chat", { _other_user_id: otherUserId });

    if (error || !chatId) {
      console.error("Error creating chat:", error);
      setCreating(false);
      return;
    }

    navigate(`/chat/${chatId}`);
  };

  const toggleSelected = (userId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const exitGroupMode = () => {
    setGroupMode(false);
    setGroupName("");
    setSelectedIds(new Set());
  };

  const createGroup = async () => {
    if (!user || creating || !groupName.trim() || selectedIds.size === 0) return;
    setCreating(true);

    const { data: chatId, error } = await supabase.rpc("create_group_chat", {
      _name: groupName.trim(),
      _participant_ids: [...selectedIds],
    });

    if (error || !chatId) {
      console.error("Error creating group:", error);
      setCreating(false);
      return;
    }

    navigate(`/chat/${chatId}`);
  };

  const filteredUsers = users.filter((u) =>
    u.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex items-center gap-3 bg-primary px-4 py-3 text-primary-foreground">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => (groupMode ? exitGroupMode() : navigate("/"))}
          className="text-primary-foreground hover:bg-primary/80"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold">{groupMode ? "Novo Grupo" : "Nova Conversa"}</h1>
      </header>

      <div className="px-4 py-3 space-y-2">
        {groupMode && (
          <Input
            placeholder="Nome do grupo"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            maxLength={80}
          />
        )}
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar contato..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {groupMode && selectedIds.size > 0 && (
        <p className="px-4 pb-2 text-sm text-muted-foreground">
          {selectedIds.size} contato{selectedIds.size > 1 ? "s" : ""} selecionado{selectedIds.size > 1 ? "s" : ""}
        </p>
      )}

      <div className="flex-1 overflow-y-auto pb-20">
        {!groupMode && (
          <button
            className="flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left transition-colors hover:bg-accent"
            onClick={() => setGroupMode(true)}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/20 text-primary">
              <Users className="h-6 w-6" />
            </div>
            <p className="font-semibold">Novo grupo</p>
          </button>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : filteredUsers.length === 0 ? (
          <p className="text-center py-20 text-muted-foreground">Nenhum contato encontrado</p>
        ) : (
          filteredUsers.map((u) => {
            const initials = u.name
              .split(" ")
              .map((n) => n[0])
              .join("")
              .toUpperCase()
              .slice(0, 2);
            const selected = selectedIds.has(u.id);

            return (
              <button
                key={u.id}
                className="flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left transition-colors hover:bg-accent"
                onClick={() => (groupMode ? toggleSelected(u.id) : startChat(u.id))}
                disabled={creating}
              >
                <Avatar className="h-12 w-12">
                  <AvatarImage src={u.avatar_url ?? undefined} />
                  <AvatarFallback className="bg-primary/20 text-primary">{initials}</AvatarFallback>
                </Avatar>
                <p className="flex-1 font-semibold">{u.name}</p>
                {groupMode && (
                  <div
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                      selected ? "bg-primary border-primary" : "border-muted-foreground"
                    }`}
                  >
                    {selected && <Check className="h-4 w-4 text-primary-foreground" />}
                  </div>
                )}
              </button>
            );
          })
        )}
      </div>

      {groupMode && (
        <Button
          size="icon"
          className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg disabled:opacity-40"
          disabled={!groupName.trim() || selectedIds.size === 0 || creating}
          onClick={createGroup}
        >
          <Check className="h-6 w-6" />
        </Button>
      )}
    </div>
  );
}
