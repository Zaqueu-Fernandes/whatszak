import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, Send, Phone, Video, X, Eye, EyeOff } from "lucide-react";
import { useNotificationSound, useBrowserNotifications } from "@/hooks/use-notifications";
import { sendPushToUser } from "@/lib/push";
import { resolveMediaUrl, getUserLimitProfile } from "@/lib/media";
import MessageBubble from "@/components/chat/MessageBubble";
import AttachmentPicker from "@/components/chat/AttachmentPicker";
import CameraCapture from "@/components/chat/CameraCapture";
import AudioRecorder from "@/components/chat/AudioRecorder";
import ActiveCallOverlay from "@/components/call/ActiveCallOverlay";
import ForwardMessageDialog from "@/components/chat/ForwardMessageDialog";
import { useWebRTC } from "@/hooks/use-webrtc";
import type { CallMode } from "@/hooks/use-webrtc";
import { toast } from "@/hooks/use-toast";

interface Message {
  id: string;
  sender_id: string;
  encrypted_content: string | null;
  message_type: string;
  media_url: string | null;
  created_at: string;
  deleted_at: string | null;
  media_expired_at: string | null;
  reply_to_id: string | null;
  view_once: boolean;
  viewed_at: string | null;
}

interface ChatInfo {
  name: string;
  avatar_url?: string;
  is_group: boolean;
  other_user_id?: string;
}

export default function ChatScreen() {
  const { chatId } = useParams<{ chatId: string }>();
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [chatInfo, setChatInfo] = useState<ChatInfo | null>(null);
  const [sending, setSending] = useState(false);
  const [deletedForMe, setDeletedForMe] = useState<Set<string>>(new Set());
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [forwardingMsg, setForwardingMsg] = useState<Message | null>(null);
  const [viewOnce, setViewOnce] = useState(false);
  // "Privacidade" limit profile already forces every media message to
  // view-once server-side (see handleFileSelected/handleAudioRecorded) —
  // showing the manual toggle on top of that is redundant and confusing,
  // since it looks off but every send behaves as if it were on.
  const [autoDeleteOnView, setAutoDeleteOnView] = useState(false);
  const [senderNames, setSenderNames] = useState<Record<string, string>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const navigate = useNavigate();
  const playSound = useNotificationSound();
  const { showNotification } = useBrowserNotifications();

  const handleRemoteStream = useCallback((stream: MediaStream) => {
    setRemoteStream(stream);
  }, []);

  const handleCallEnded = useCallback(() => {
    toast({ title: "Chamada encerrada" });
  }, []);

  const {
    callStatus,
    callMode,
    startCall,
    endCall,
    getLocalStream,
  } = useWebRTC({
    userId: user?.id ?? "",
    onRemoteStream: handleRemoteStream,
    onCallEnded: handleCallEnded,
  });

  const handleStartCall = (mode: CallMode) => {
    if (!chatId || !chatInfo?.other_user_id || chatInfo.is_group) return;
    startCall(chatId, chatInfo.other_user_id, mode);
  };

  useEffect(() => {
    if (!user) return;
    getUserLimitProfile(user.id).then(({ autoDeleteOnView }) => setAutoDeleteOnView(autoDeleteOnView));
  }, [user]);

  // Belt-and-suspenders for the header/footer pin: on some WebView
  // engines, `body`'s safe-area-inset padding (src/index.css) can push its
  // total height a few pixels past 100vh/100dvh even with the screen root's
  // own overflow-hidden, letting the page itself scroll by that sliver —
  // enough for a fixed status bar area to visibly drift on some devices but
  // not others. Locking body scroll while this screen is mounted removes
  // that possibility outright; other screens (ChatList, Profile, ...) still
  // rely on normal page scroll, so this only applies here and is reverted
  // on unmount.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    if (!chatId || !user) return;
    loadChatInfo();
    loadMessages();
    loadDeletedForMe();
    markAsRead();

    const channel = supabase
      .channel(`chat-${chatId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `chat_id=eq.${chatId}`,
      }, (payload) => {
        const newMsg = payload.new as Message;
        // Own messages are already added optimistically right after insert
        // (see handleSend/handleFileSelected/handleAudioRecorded) — skip if
        // this echo for the same row already landed, so it doesn't show
        // twice.
        setMessages((prev) => (prev.some((m) => m.id === newMsg.id) ? prev : [...prev, newMsg]));
        if (newMsg.sender_id !== user?.id) {
          playSound();
          showNotification(
            chatInfo?.name ?? "Nova mensagem",
            newMsg.encrypted_content ?? "Mídia"
          );
          supabase.rpc("mark_messages_as_read", { _chat_id: chatId }).then();
        }
      })
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "messages",
        filter: `chat_id=eq.${chatId}`,
      }, (payload) => {
        const updated = payload.new as Message;
        setMessages((prev) =>
          prev.map((m) => (m.id === updated.id ? updated : m))
        );
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [chatId, user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadDeletedForMe = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("message_deletions")
      .select("message_id")
      .eq("user_id", user.id);
    if (data) {
      setDeletedForMe(new Set(data.map((d) => d.message_id)));
    }
  };

  const loadChatInfo = async () => {
    if (!chatId || !user) return;

    const { data: chat } = await supabase
      .from("chats")
      .select("name, is_group")
      .eq("id", chatId)
      .single();

    if (!chat) return;

    if (chat.is_group) {
      setChatInfo({ name: chat.name ?? "Grupo", is_group: true });
    } else {
      const { data: participants } = await supabase
        .from("chat_participants")
        .select("user_id")
        .eq("chat_id", chatId)
        .neq("user_id", user.id)
        .limit(1);

      if (participants?.[0]) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("name, avatar_url")
          .eq("id", participants[0].user_id)
          .single();

        setChatInfo({
          name: profile?.name ?? "Usuário",
          avatar_url: profile?.avatar_url ?? undefined,
          is_group: false,
          other_user_id: participants[0].user_id,
        });
      }
    }
  };

  const loadMessages = async () => {
    if (!chatId) return;
    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: true });
    if (data) {
      setMessages(data as Message[]);
      // Load sender names for reply previews
      const senderIds = [...new Set(data.map((m) => m.sender_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, name")
        .in("id", senderIds);
      if (profiles) {
        const names: Record<string, string> = {};
        profiles.forEach((p) => (names[p.id] = p.name));
        setSenderNames(names);
      }
    }
  };

  const markAsRead = async () => {
    if (!chatId || !user) return;
    await supabase.rpc("mark_messages_as_read", { _chat_id: chatId });
  };

  const notifyOtherParticipants = async (preview: string) => {
    if (!chatId || !user) {
      console.log("[PUSH] notifyOtherParticipants skipped: no chatId or user");
      return;
    }
    try {
      console.log("[PUSH] notifyOtherParticipants called for chat:", chatId);
      const { data: participants, error: partError } = await supabase
        .from("chat_participants")
        .select("user_id")
        .eq("chat_id", chatId)
        .neq("user_id", user.id);
      if (partError) {
        console.error("[PUSH] Error loading participants:", partError);
        return;
      }
      if (!participants || participants.length === 0) {
        console.log("[PUSH] No other participants found");
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("name")
        .eq("id", user.id)
        .single();
      const senderName = profile?.name ?? "Nova mensagem";
      console.log("[PUSH] Sending to", participants.length, "participants as", senderName);
      for (const p of participants) {
        // Await each push to ensure errors are caught
        await sendPushToUser(p.user_id, senderName, preview, { chat_id: chatId });
      }
      console.log("[PUSH] All pushes sent");
    } catch (err: any) {
      console.error("[PUSH] notifyOtherParticipants error:", err?.message || err);
    }
  };

  const handleSend = async () => {
    if (!newMessage.trim() || !chatId || !user || sending) return;
    setSending(true);
    const content = newMessage.trim();
    setNewMessage("");
    const replyId = replyingTo?.id ?? null;
    const isViewOnce = viewOnce;
    setReplyingTo(null);
    setViewOnce(false);
    const { data } = await supabase
      .from("messages")
      .insert({
        chat_id: chatId,
        sender_id: user.id,
        encrypted_content: content,
        message_type: "text",
        reply_to_id: replyId,
        view_once: isViewOnce,
      })
      .select()
      .single();
    // Add it locally right away instead of waiting for the realtime echo —
    // that round-trip could take a few seconds, which read as "my message
    // never showed up" (the INSERT handler above dedupes this by id).
    if (data) setMessages((prev) => [...prev, data as Message]);
    // Fire push notification (don't block UI but log errors)
    notifyOtherParticipants(content).catch((err) => console.error("[PUSH] notify error:", err));
    setSending(false);
  };

  const checkFileSizeLimit = async (file: File | Blob): Promise<boolean> => {
    if (!user) return false;
    const { maxFileSizeMb: maxMb } = await getUserLimitProfile(user.id);
    if (maxMb != null && file.size > maxMb * 1024 * 1024) {
      toast({
        title: "Arquivo muito grande",
        description: `O limite do seu plano é ${maxMb}MB. Esse arquivo tem ${(file.size / (1024 * 1024)).toFixed(1)}MB.`,
        variant: "destructive",
      });
      return false;
    }
    return true;
  };

  const handleFileSelected = async (file: File, type: "image" | "video" | "file") => {
    if (!chatId || !user || sending) return;
    if (!(await checkFileSizeLimit(file))) return;
    setSending(true);

    // Users on a profile with auto_delete_on_view (e.g. "Privacidade") get
    // every media message treated as view-once automatically, on top of
    // whatever the sender chose with the manual toggle.
    const { autoDeleteOnView } = await getUserLimitProfile(user.id);
    const isViewOnce = viewOnce || autoDeleteOnView;

    const ext = file.name.split(".").pop() ?? "bin";
    const filePath = `${user.id}/${chatId}/${Date.now()}.${ext}`;

    const { error } = await supabase.storage.from("media").upload(filePath, file);
    if (error) {
      toast({ title: "Erro ao enviar", description: error.message, variant: "destructive" });
      setSending(false);
      return;
    }

    const { data } = await supabase
      .from("messages")
      .insert({
        chat_id: chatId,
        sender_id: user.id,
        encrypted_content: type === "file" ? file.name : null,
        message_type: type,
        media_url: filePath,
        view_once: isViewOnce,
      })
      .select()
      .single();
    if (data) setMessages((prev) => [...prev, data as Message]);
    notifyOtherParticipants(type === "image" ? "📷 Imagem" : type === "video" ? "🎥 Vídeo" : "📎 Arquivo");
    setViewOnce(false);
    setSending(false);
  };

  const handleAudioRecorded = async (blob: Blob) => {
    if (!chatId || !user) return;
    if (!(await checkFileSizeLimit(blob))) return;
    setSending(true);

    const { autoDeleteOnView } = await getUserLimitProfile(user.id);
    const isViewOnce = viewOnce || autoDeleteOnView;

    const filePath = `${user.id}/${chatId}/${Date.now()}.webm`;

    const { error } = await supabase.storage.from("media").upload(filePath, blob);
    if (error) {
      toast({ title: "Erro ao enviar áudio", description: error.message, variant: "destructive" });
      setSending(false);
      return;
    }

    const { data } = await supabase
      .from("messages")
      .insert({
        chat_id: chatId,
        sender_id: user.id,
        message_type: "audio",
        media_url: filePath,
        view_once: isViewOnce,
      })
      .select()
      .single();
    if (data) setMessages((prev) => [...prev, data as Message]);
    notifyOtherParticipants("🎵 Áudio");
    setViewOnce(false);
    setSending(false);
  };

  const handleDeleteForMe = async (msgId: string) => {
    if (!user) return;
    await supabase.from("message_deletions").insert({
      message_id: msgId,
      user_id: user.id,
    });
    setDeletedForMe((prev) => new Set(prev).add(msgId));
    toast({ title: "Mensagem apagada para você" });
  };

  const handleDeleteForAll = async (msgId: string) => {
    await supabase
      .from("messages")
      .update({ deleted_at: new Date().toISOString(), encrypted_content: null, media_url: null })
      .eq("id", msgId);
    toast({ title: "Mensagem apagada para todos" });
  };

  const handleViewOnceOpen = async (msgId: string) => {
    // Called by MessageBubble only after the media has actually
    // loaded/played/opened (not on the initial "tap to view"), so the file
    // can't be deleted out from under a viewer who hasn't seen it yet.
    // Marks viewed_at AND actually deletes the file from Storage (the viewer
    // isn't the file's owner, so this has to run with elevated privileges —
    // see the delete-viewed-media Edge Function). The messages array picks
    // up the resulting viewed_at/media_url change via the realtime UPDATE
    // subscription above, not an optimistic local update here.
    const { error } = await supabase.functions.invoke("delete-viewed-media", {
      body: { message_id: msgId },
    });
    if (error) {
      console.error("[ViewOnce] delete-viewed-media error:", error);
    }
  };

  const handleReply = (msgId: string) => {
    const msg = messages.find((m) => m.id === msgId);
    if (msg) setReplyingTo(msg);
  };

  const handleForward = (msgId: string) => {
    const msg = messages.find((m) => m.id === msgId);
    if (msg) setForwardingMsg(msg);
  };

  const handleShare = async (msgId: string) => {
    const msg = messages.find((m) => m.id === msgId);
    if (!msg) return;

    // msg.media_url is a raw Storage path (or an old pre-signed URL), not a
    // link that's actually fetchable outside the app — resolve it first.
    const mediaLink = msg.media_url ? await resolveMediaUrl(msg.media_url) : null;

    const text =
      msg.message_type === "text"
        ? msg.encrypted_content ?? ""
        : mediaLink ?? msg.encrypted_content ?? "";

    if (navigator.share) {
      try {
        await navigator.share({
          title: "Mensagem",
          text,
          url: mediaLink ?? undefined,
        });
      } catch {
        // user cancelled
      }
    } else {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copiado para a área de transferência" });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const getReplyInfo = (msg: Message) => {
    if (!msg.reply_to_id) return null;
    const replied = messages.find((m) => m.id === msg.reply_to_id);
    if (!replied) return null;
    return {
      id: replied.id,
      content: replied.encrypted_content,
      messageType: replied.message_type,
      senderName: senderNames[replied.sender_id] ?? "Usuário",
    };
  };

  const initials = chatInfo?.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) ?? "?";

  const visibleMessages = messages.filter((m) => !deletedForMe.has(m.id));

  return (
    <div className="flex h-screen h-dvh flex-col overflow-hidden bg-chat-bg">
      {/* Header */}
      <header className="shrink-0 flex items-center gap-3 bg-primary px-3 py-2 text-primary-foreground">
        <Button variant="ghost" size="icon" onClick={() => navigate("/")} className="text-primary-foreground hover:bg-primary/80">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <Avatar className="h-10 w-10">
          <AvatarImage src={chatInfo?.avatar_url} />
          <AvatarFallback className="bg-primary-foreground/20 text-primary-foreground text-sm">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <p className="font-semibold">{chatInfo?.name ?? "..."}</p>
        </div>
        {!chatInfo?.is_group && chatInfo?.other_user_id && (
          <>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleStartCall("video")}
              disabled={callStatus !== "idle"}
              className="text-primary-foreground hover:bg-primary/80"
            >
              <Video className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleStartCall("audio")}
              disabled={callStatus !== "idle"}
              className="text-primary-foreground hover:bg-primary/80"
            >
              <Phone className="h-5 w-5" />
            </Button>
          </>
        )}
      </header>

      {/* Call overlay */}
      {callStatus !== "idle" && (
        <ActiveCallOverlay
          peerName={chatInfo?.name ?? "Usuário"}
          peerAvatar={chatInfo?.avatar_url}
          status={callStatus as "calling" | "ringing" | "answered"}
          mode={callMode}
          localStream={getLocalStream()}
          remoteStream={remoteStream}
          onHangUp={() => endCall()}
        />
      )}

      {/* Forward dialog */}
      {forwardingMsg && (
        <ForwardMessageDialog
          message={forwardingMsg}
          onClose={() => setForwardingMsg(null)}
        />
      )}

      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-4 space-y-2">
        {visibleMessages.map((msg) => (
          <MessageBubble
            key={msg.id}
            id={msg.id}
            content={msg.encrypted_content}
            mediaUrl={msg.media_url}
            messageType={msg.message_type}
            isMine={msg.sender_id === user?.id}
            createdAt={msg.created_at}
            deleted={!!msg.deleted_at}
            mediaExpired={!!msg.media_expired_at}
            viewOnce={msg.view_once}
            viewedAt={msg.viewed_at}
            replyTo={getReplyInfo(msg)}
            onReply={handleReply}
            onDeleteForMe={handleDeleteForMe}
            onDeleteForAll={handleDeleteForAll}
            onForward={handleForward}
            onShare={handleShare}
            onViewOnceOpen={handleViewOnceOpen}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Reply preview */}
      {replyingTo && (
        <div className="shrink-0 flex items-center gap-2 bg-muted px-3 py-2 border-t border-border">
          <div className="flex-1 border-l-2 border-primary pl-2">
            <p className="text-xs font-semibold text-primary">
              {replyingTo.sender_id === user?.id ? "Você" : senderNames[replyingTo.sender_id] ?? "Usuário"}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {replyingTo.message_type === "audio" ? "🎵 Áudio" :
               replyingTo.message_type === "image" ? "📷 Imagem" :
               replyingTo.message_type === "video" ? "🎥 Vídeo" :
               replyingTo.message_type === "file" ? "📎 Arquivo" :
               replyingTo.encrypted_content ?? ""}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setReplyingTo(null)} className="h-8 w-8">
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* View once indicator */}
      {viewOnce && !autoDeleteOnView && (
        <div className="shrink-0 flex items-center gap-2 bg-primary/10 px-3 py-1.5 border-t border-border">
          <EyeOff className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs text-primary font-medium flex-1">Visualização única ativada</span>
          <Button variant="ghost" size="icon" onClick={() => setViewOnce(false)} className="h-6 w-6">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
      {/* Input */}
      <div className="shrink-0 flex items-center gap-1 border-t border-border bg-card px-2 py-2">
        <AttachmentPicker onFileSelected={handleFileSelected} disabled={sending} />
        <CameraCapture onCaptured={handleFileSelected} disabled={sending} />
        {!autoDeleteOnView && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setViewOnce(!viewOnce)}
            className={`h-9 w-9 shrink-0 ${viewOnce ? "text-primary bg-primary/10" : "text-muted-foreground"}`}
            title="Visualização única"
          >
            {viewOnce ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        )}
        <Input
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Mensagem"
          className="flex-1 rounded-full"
        />
        {newMessage.trim() ? (
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!newMessage.trim() || sending}
            className="rounded-full h-10 w-10"
          >
            <Send className="h-4 w-4" />
          </Button>
        ) : (
          <AudioRecorder onRecorded={handleAudioRecorded} disabled={sending} />
        )}
      </div>
    </div>
  );
}
