import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Search } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface ForwardMessageDialogProps {
  message: {
    encrypted_content: string | null;
    message_type: string;
    media_url: string | null;
  };
  onClose: () => void;
}

interface ChatOption {
  id: string;
  name: string;
  avatar_url?: string;
}

export default function ForwardMessageDialog({ message, onClose }: ForwardMessageDialogProps) {
  const { user } = useAuth();
  const [chats, setChats] = useState<ChatOption[]>([]);
  const [search, setSearch] = useState("");
  const [forwarding, setForwarding] = useState(false);

  useEffect(() => {
    loadChats();
  }, []);

  const loadChats = async () => {
    if (!user) return;

    const { data: participants } = await supabase
      .from("chat_participants")
      .select("chat_id")
      .eq("user_id", user.id);

    if (!participants) return;

    const chatIds = participants.map((p) => p.chat_id);
    const { data: chatList } = await supabase
      .from("chats")
      .select("id, name, is_group, avatar_url")
      .in("id", chatIds);

    if (!chatList) return;

    const options: ChatOption[] = [];

    for (const chat of chatList) {
      if (chat.is_group) {
        options.push({ id: chat.id, name: chat.name ?? "Grupo", avatar_url: chat.avatar_url ?? undefined });
      } else {
        const { data: otherParticipants } = await supabase
          .from("chat_participants")
          .select("user_id")
          .eq("chat_id", chat.id)
          .neq("user_id", user.id)
          .limit(1);

        if (otherParticipants?.[0]) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("name, avatar_url")
            .eq("id", otherParticipants[0].user_id)
            .single();

          options.push({
            id: chat.id,
            name: profile?.name ?? "Usuário",
            avatar_url: profile?.avatar_url ?? undefined,
          });
        }
      }
    }

    setChats(options);
  };

  const handleForward = async (targetChatId: string) => {
    if (!user || forwarding) return;
    setForwarding(true);

    await supabase.from("messages").insert({
      chat_id: targetChatId,
      sender_id: user.id,
      encrypted_content: message.encrypted_content,
      message_type: message.message_type,
      media_url: message.media_url,
    });

    toast({ title: "Mensagem encaminhada" });
    setForwarding(false);
    onClose();
  };

  const filtered = chats.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60">
      <div className="w-full max-w-md bg-card rounded-t-2xl sm:rounded-2xl max-h-[70vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-semibold text-foreground">Encaminhar para...</h3>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="px-4 py-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar conversa..."
              className="pl-9 rounded-full"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {filtered.map((chat) => {
            const initials = chat.name
              .split(" ")
              .map((n) => n[0])
              .join("")
              .toUpperCase()
              .slice(0, 2);

            return (
              <button
                key={chat.id}
                onClick={() => handleForward(chat.id)}
                disabled={forwarding}
                className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-muted transition-colors text-left"
              >
                <Avatar className="h-10 w-10">
                  <AvatarImage src={chat.avatar_url} />
                  <AvatarFallback className="bg-primary/20 text-primary text-sm">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <span className="font-medium text-foreground">{chat.name}</span>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-center text-muted-foreground py-8 text-sm">Nenhuma conversa encontrada</p>
          )}
        </div>
      </div>
    </div>
  );
}
