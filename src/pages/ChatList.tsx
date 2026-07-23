import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageCircle, Phone, User, Search, Plus, Shield } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNotificationSound, useBrowserNotifications } from "@/hooks/use-notifications";
import { toast } from "sonner";
import PullToRefresh from "@/components/PullToRefresh";

interface ChatItem {
  id: string;
  name: string | null;
  is_group: boolean;
  last_message?: string;
  last_message_time?: string;
  avatar_url?: string;
  other_user_name?: string;
  unread_count: number;
}

export default function ChatList() {
  const { user } = useAuth();
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const navigate = useNavigate();
  const playSound = useNotificationSound();
  const { requestPermission, showNotification } = useBrowserNotifications();

  useEffect(() => {
    if (!user) return;
    supabase.rpc("has_role", { _user_id: user.id, _role: "admin" }).then(({ data }) => {
      setIsAdmin(!!data);
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    loadChats();
    requestPermission();

    const channel = supabase
      .channel("chat-list-updates")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const msg = payload.new as { sender_id: string; encrypted_content?: string; chat_id?: string };
        if (msg.sender_id !== user.id) {
          playSound();
          // Internal toast pop-up
          toast("Nova mensagem", {
            description: msg.encrypted_content ?? "Mídia recebida",
            action: msg.chat_id ? {
              label: "Abrir",
              onClick: () => navigate(`/chat/${msg.chat_id}`),
            } : undefined,
          });
          showNotification("WhatsZak", msg.encrypted_content ?? "Nova mensagem", () => {
            window.focus();
          });
        }
        loadChats();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const loadChats = async () => {
    if (!user) return;

    const { data: participantChats } = await supabase
      .from("chat_participants")
      .select("chat_id")
      .eq("user_id", user.id);

    if (!participantChats?.length) {
      setChats([]);
      setLoading(false);
      return;
    }

    const chatIds = participantChats.map((p) => p.chat_id);

    // Fetch all data in parallel instead of sequentially per chat
    const [chatsRes, allParticipantsRes, allMessagesRes, unreadRes] = await Promise.all([
      supabase.from("chats").select("id, name, is_group").in("id", chatIds),
      supabase.from("chat_participants").select("chat_id, user_id").in("chat_id", chatIds).neq("user_id", user.id),
      supabase.from("messages").select("chat_id, encrypted_content, created_at, sender_id, is_read").in("chat_id", chatIds).order("created_at", { ascending: false }),
      supabase.from("messages").select("chat_id, id").in("chat_id", chatIds).eq("is_read", false).neq("sender_id", user.id),
    ]);

    const chatData = chatsRes.data;
    if (!chatData) { setLoading(false); return; }

    // Build lookup: last message per chat
    const lastMsgMap = new Map<string, { encrypted_content: string | null; created_at: string }>();
    for (const msg of allMessagesRes.data ?? []) {
      if (!lastMsgMap.has(msg.chat_id)) {
        lastMsgMap.set(msg.chat_id, { encrypted_content: msg.encrypted_content, created_at: msg.created_at });
      }
    }

    // Build lookup: unread count per chat
    const unreadMap = new Map<string, number>();
    for (const msg of unreadRes.data ?? []) {
      unreadMap.set(msg.chat_id, (unreadMap.get(msg.chat_id) ?? 0) + 1);
    }

    // Build lookup: other user per chat (for 1:1 chats)
    const otherUserIds = new Set<string>();
    const chatOtherUser = new Map<string, string>();
    for (const p of allParticipantsRes.data ?? []) {
      if (!chatOtherUser.has(p.chat_id)) {
        chatOtherUser.set(p.chat_id, p.user_id);
        otherUserIds.add(p.user_id);
      }
    }

    // Fetch all needed profiles in one query
    let profileMap = new Map<string, { name: string; avatar_url: string | null }>();
    if (otherUserIds.size > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, name, avatar_url")
        .in("id", [...otherUserIds]);
      for (const p of profiles ?? []) {
        profileMap.set(p.id, { name: p.name, avatar_url: p.avatar_url });
      }
    }

    const enrichedChats: ChatItem[] = chatData.map((chat) => {
      const lastMsg = lastMsgMap.get(chat.id);
      const otherUserId = chatOtherUser.get(chat.id);
      const profile = otherUserId ? profileMap.get(otherUserId) : undefined;

      return {
        id: chat.id,
        name: chat.name,
        is_group: chat.is_group,
        last_message: lastMsg?.encrypted_content ?? undefined,
        last_message_time: lastMsg?.created_at ?? undefined,
        avatar_url: (!chat.is_group && profile?.avatar_url) ? profile.avatar_url : undefined,
        other_user_name: !chat.is_group ? profile?.name ?? chat.name ?? undefined : undefined,
        unread_count: unreadMap.get(chat.id) ?? 0,
      };
    });

    enrichedChats.sort((a, b) => {
      if (!a.last_message_time) return 1;
      if (!b.last_message_time) return -1;
      return new Date(b.last_message_time).getTime() - new Date(a.last_message_time).getTime();
    });

    setChats(enrichedChats);
    setLoading(false);
  };

  const filteredChats = chats.filter((c) =>
    (c.other_user_name ?? c.name ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="bg-primary px-4 py-3 text-primary-foreground">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">WhatsZak</h1>
          <Button
            variant="ghost"
            size="icon"
            className="text-primary-foreground hover:bg-primary/80"
            onClick={() => navigate("/new-chat")}
          >
            <Plus className="h-5 w-5" />
          </Button>
        </div>
        <div className="mt-3 relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-primary-foreground/60" />
          <Input
            placeholder="Pesquisar conversa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border-0 bg-primary/80 pl-10 text-primary-foreground placeholder:text-primary-foreground/60 focus-visible:ring-0"
          />
        </div>
      </header>

      {/* Chat list */}
      <PullToRefresh onRefresh={loadChats} className="flex-1">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : filteredChats.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <MessageCircle className="mb-3 h-12 w-12" />
            <p>Nenhuma conversa ainda</p>
            <Button variant="link" onClick={() => navigate("/new-chat")} className="mt-2">
              Iniciar nova conversa
            </Button>
          </div>
        ) : (
          filteredChats.map((chat) => {
            const initials = (chat.other_user_name ?? chat.name ?? "?")
              .split(" ")
              .map((n) => n[0])
              .join("")
              .toUpperCase()
              .slice(0, 2);

            return (
              <button
                key={chat.id}
                className="flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left transition-colors hover:bg-accent"
                onClick={() => navigate(`/chat/${chat.id}`)}
              >
                <Avatar className="h-12 w-12">
                  <AvatarImage src={chat.avatar_url} />
                  <AvatarFallback className="bg-primary/20 text-primary">{initials}</AvatarFallback>
                </Avatar>
                <div className="flex-1 overflow-hidden">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold truncate">{chat.other_user_name ?? chat.name ?? "Chat"}</p>
                    <div className="flex flex-col items-end gap-1 ml-2">
                      {chat.last_message_time && (
                        <span className={`text-xs whitespace-nowrap ${chat.unread_count > 0 ? 'text-primary font-semibold' : 'text-muted-foreground'}`}>
                          {formatDistanceToNow(new Date(chat.last_message_time), {
                            addSuffix: false,
                            locale: ptBR,
                          })}
                        </span>
                      )}
                      {chat.unread_count > 0 && (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">
                          {chat.unread_count}
                        </span>
                      )}
                    </div>
                  </div>
                  {chat.last_message && (
                    <p className={`text-sm truncate ${chat.unread_count > 0 ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>{chat.last_message}</p>
                  )}
                </div>
              </button>
            );
          })
        )}
      </PullToRefresh>

      {/* Bottom nav */}
      <nav className="flex items-center justify-around border-t border-border bg-card py-2">
        <Button variant="ghost" className="flex flex-col items-center gap-1 h-auto text-primary" onClick={() => navigate("/")}>
          <MessageCircle className="h-5 w-5" />
          <span className="text-xs">Chats</span>
        </Button>
        <Button variant="ghost" className="flex flex-col items-center gap-1 h-auto text-muted-foreground" onClick={() => navigate("/calls")}>
          <Phone className="h-5 w-5" />
          <span className="text-xs">Chamadas</span>
        </Button>
        <Button variant="ghost" className="flex flex-col items-center gap-1 h-auto text-muted-foreground" onClick={() => navigate("/profile")}>
          <User className="h-5 w-5" />
          <span className="text-xs">Perfil</span>
        </Button>
        {isAdmin && (
          <Button variant="ghost" className="flex flex-col items-center gap-1 h-auto text-muted-foreground" onClick={() => navigate("/admin")}>
            <Shield className="h-5 w-5" />
            <span className="text-xs">Admin</span>
          </Button>
        )}
      </nav>
    </div>
  );
}
