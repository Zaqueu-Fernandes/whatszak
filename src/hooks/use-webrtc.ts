import { useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { sendPushToUser } from "@/lib/push";

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export type CallStatus = "idle" | "calling" | "ringing" | "answered" | "ended";
export type CallMode = "audio" | "video";

interface UseWebRTCOptions {
  userId: string;
  onRemoteStream: (stream: MediaStream) => void;
  onCallEnded: () => void;
}

export function useWebRTC({ userId, onRemoteStream, onCallEnded }: UseWebRTCOptions) {
  const [callStatus, setCallStatus] = useState<CallStatus>("idle");
  const [callId, setCallId] = useState<string | null>(null);
  const [callMode, setCallMode] = useState<CallMode>("audio");
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const cleanup = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    setCallStatus("idle");
    setCallId(null);
    setCallMode("audio");
  }, []);

  const getLocalStream = async (mode: CallMode) => {
    const constraints: MediaStreamConstraints = {
      audio: true,
      video: mode === "video" ? { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } } : false,
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    localStreamRef.current = stream;
    return stream;
  };

  const createPeerConnection = (currentCallId: string) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        await supabase.from("call_ice_candidates").insert({
          call_id: currentCallId,
          sender_id: userId,
          candidate: event.candidate.toJSON() as any,
        });
      }
    };

    pc.ontrack = (event) => {
      if (event.streams[0]) {
        onRemoteStream(event.streams[0]);
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "disconnected" || pc.iceConnectionState === "failed") {
        endCall(currentCallId);
      }
    };

    return pc;
  };

  const subscribeToSignaling = (currentCallId: string, role: "caller" | "callee") => {
    const channel = supabase
      .channel(`call-${currentCallId}`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "calls",
        filter: `id=eq.${currentCallId}`,
      }, async (payload) => {
        const call = payload.new as any;

        if (call.status === "answered" && role === "caller" && call.answer) {
          const pc = pcRef.current;
          if (pc && pc.signalingState === "have-local-offer") {
            await pc.setRemoteDescription(new RTCSessionDescription(call.answer));
            setCallStatus("answered");
          }
        }

        if (call.status === "ended" || call.status === "rejected") {
          cleanup();
          onCallEnded();
        }
      })
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "call_ice_candidates",
        filter: `call_id=eq.${currentCallId}`,
      }, async (payload) => {
        const row = payload.new as any;
        if (row.sender_id !== userId && pcRef.current) {
          try {
            await pcRef.current.addIceCandidate(new RTCIceCandidate(row.candidate));
          } catch (e) {
            console.warn("ICE candidate error:", e);
          }
        }
      })
      .subscribe();

    channelRef.current = channel;
  };

  const startCall = async (chatId: string, calleeId: string, mode: CallMode = "audio") => {
    try {
      setCallMode(mode);
      setCallStatus("calling");
      const stream = await getLocalStream(mode);

      const { data: call, error } = await supabase
        .from("calls")
        .insert({
          chat_id: chatId,
          caller_id: userId,
          callee_id: calleeId,
          status: "ringing",
        })
        .select()
        .single();

      if (error || !call) {
        console.error("Error creating call:", error);
        cleanup();
        return;
      }

      const currentCallId = call.id;
      setCallId(currentCallId);

      // Send push notification to callee for when app is minimized/closed
      const { data: callerProfile } = await supabase
        .from("profiles")
        .select("name")
        .eq("id", userId)
        .single();
      const callerName = callerProfile?.name ?? "Alguém";
      const callType = mode === "video" ? "vídeo" : "áudio";
      sendPushToUser(
        calleeId,
        `📞 ${callerName}`,
        `Chamada de ${callType} recebida`,
        { chat_id: chatId, call_id: currentCallId, type: "call", call_type: mode }
      ).catch((err) => console.error("[PUSH] call push error:", err));

      const pc = createPeerConnection(currentCallId);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      subscribeToSignaling(currentCallId, "caller");

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      await supabase
        .from("calls")
        .update({ offer: offer as any })
        .eq("id", currentCallId);
    } catch (e) {
      console.error("startCall error:", e);
      cleanup();
    }
  };

  const answerCall = async (incomingCallId: string, mode: CallMode = "audio") => {
    try {
      setCallMode(mode);
      setCallStatus("answered");
      setCallId(incomingCallId);

      const stream = await getLocalStream(mode);

      const { data: call } = await supabase
        .from("calls")
        .select("*")
        .eq("id", incomingCallId)
        .single();

      if (!call?.offer) {
        cleanup();
        return;
      }

      const pc = createPeerConnection(incomingCallId);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      subscribeToSignaling(incomingCallId, "callee");

      await pc.setRemoteDescription(new RTCSessionDescription(call.offer as unknown as RTCSessionDescriptionInit));

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      await supabase
        .from("calls")
        .update({ answer: answer as any, status: "answered" })
        .eq("id", incomingCallId);

      const { data: candidates } = await supabase
        .from("call_ice_candidates")
        .select("*")
        .eq("call_id", incomingCallId)
        .neq("sender_id", userId);

      if (candidates) {
        for (const c of candidates) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(c.candidate as RTCIceCandidateInit));
          } catch (e) {
            console.warn("ICE apply error:", e);
          }
        }
      }
    } catch (e) {
      console.error("answerCall error:", e);
      cleanup();
    }
  };

  const endCall = async (overrideCallId?: string) => {
    const id = overrideCallId ?? callId;
    if (id) {
      await supabase
        .from("calls")
        .update({ status: "ended", ended_at: new Date().toISOString() })
        .eq("id", id);
    }
    cleanup();
    onCallEnded();
  };

  const rejectCall = async (incomingCallId: string) => {
    await supabase
      .from("calls")
      .update({ status: "rejected", ended_at: new Date().toISOString() })
      .eq("id", incomingCallId);
  };

  return {
    callStatus,
    callId,
    callMode,
    startCall,
    answerCall,
    endCall,
    rejectCall,
    localStream: localStreamRef.current,
    getLocalStream: () => localStreamRef.current,
    cleanup,
  };
}
