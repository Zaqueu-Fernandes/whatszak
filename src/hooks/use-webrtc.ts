import { useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { sendPushToUser } from "@/lib/push";

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    // TURN relay — required for calls to connect when the two devices are on
    // different networks (mobile data, different Wi-Fi, carrier-grade NAT).
    // STUN alone only works when a direct/reflexive path is possible, which
    // is not the common case for two phones calling each other.
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443?transport=tcp",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
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
  const peerIdRef = useRef<string | null>(null);
  // Tracked alongside peerIdRef so the "call ended" push (sent after cleanup()
  // has already reset call state) can still tell send-push which chat this
  // call belongs to, letting it verify the caller/callee actually share it.
  const chatIdRef = useRef<string | null>(null);
  const facingModeRef = useRef<"user" | "environment">("user");
  // ICE candidates that arrive over Realtime before the remote description
  // has been applied yet (addIceCandidate throws in that state) are queued
  // here and flushed right after setRemoteDescription resolves.
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  const cleanup = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    pendingCandidatesRef.current = [];
    setCallStatus("idle");
    setCallId(null);
    setCallMode("audio");
    peerIdRef.current = null;
    chatIdRef.current = null;
  }, []);

  const flushPendingCandidates = async (pc: RTCPeerConnection) => {
    const queued = pendingCandidatesRef.current;
    pendingCandidatesRef.current = [];
    for (const candidate of queued) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.warn("ICE candidate error (queued):", e);
      }
    }
  };

  const getLocalStream = async (mode: CallMode) => {
    facingModeRef.current = "user";
    const constraints: MediaStreamConstraints = {
      audio: true,
      video: mode === "video" ? { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } } : false,
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    localStreamRef.current = stream;
    return stream;
  };

  // Swaps the outgoing video track for one from the other-facing camera,
  // live, without renegotiating the call — replaceTrack() on the existing
  // RTCRtpSender is enough since the peer connection doesn't care where a
  // track's frames come from, only that the sender keeps producing them.
  const flipCamera = async () => {
    const pc = pcRef.current;
    const stream = localStreamRef.current;
    if (!pc || !stream || callMode !== "video") return;

    const nextFacingMode = facingModeRef.current === "user" ? "environment" : "user";
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: nextFacingMode, width: { ideal: 640 }, height: { ideal: 480 } },
      });
      const newTrack = newStream.getVideoTracks()[0];
      if (!newTrack) return;

      const sender = pc.getSenders().find((s) => s.track?.kind === "video");
      if (sender) await sender.replaceTrack(newTrack);

      const oldTrack = stream.getVideoTracks()[0];
      if (oldTrack) {
        stream.removeTrack(oldTrack);
        oldTrack.stop();
      }
      stream.addTrack(newTrack);

      facingModeRef.current = nextFacingMode;
    } catch (e) {
      // Device only has one camera, or permission hiccup — leave the
      // current camera active rather than breaking the call over it.
      console.warn("[WebRTC] flipCamera failed:", e);
    }
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
      console.log("[WebRTC] ontrack fired, kind:", event.track.kind, "streams:", event.streams.length);
      if (event.streams[0]) {
        onRemoteStream(event.streams[0]);
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log("[WebRTC] iceConnectionState:", pc.iceConnectionState);
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
            await flushPendingCandidates(pc);
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
        const pc = pcRef.current;
        if (row.sender_id !== userId && pc) {
          if (!pc.remoteDescription) {
            // Remote description isn't applied yet — queue it instead of
            // letting addIceCandidate throw InvalidStateError.
            console.log("[WebRTC] queueing ICE candidate (remote description not set yet)");
            pendingCandidatesRef.current.push(row.candidate);
            return;
          }
          try {
            await pc.addIceCandidate(new RTCIceCandidate(row.candidate));
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
      peerIdRef.current = calleeId;
      chatIdRef.current = chatId;

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
    console.log("[WebRTC] answerCall called, incomingCallId:", incomingCallId, "mode:", mode, "userId:", userId);
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
      peerIdRef.current = call.caller_id;
      chatIdRef.current = call.chat_id;

      const pc = createPeerConnection(incomingCallId);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      subscribeToSignaling(incomingCallId, "callee");

      await pc.setRemoteDescription(new RTCSessionDescription(call.offer as unknown as RTCSessionDescriptionInit));
      await flushPendingCandidates(pc);

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

  const endCall = (overrideCallId?: string) => {
    const id = overrideCallId ?? callId;
    const peerId = peerIdRef.current;
    const chatId = chatIdRef.current;

    // Close the call screen immediately — don't make the user wait on the
    // network round-trip to Supabase before the "Hang up" tap takes effect.
    // The DB update and push notification still happen, just in the background.
    cleanup();
    onCallEnded();

    if (id) {
      supabase
        .from("calls")
        .update({ status: "ended", ended_at: new Date().toISOString() })
        .eq("id", id)
        .then(() => {
          // Notify the other side natively even if their app is closed, so the
          // native ringing/full-screen call UI doesn't keep going indefinitely.
          if (peerId) {
            sendPushToUser(peerId, "Chamada encerrada", "A chamada foi encerrada", {
              call_id: id,
              type: "call_ended",
              ...(chatId ? { chat_id: chatId } : {}),
            }).catch((err) => console.error("[PUSH] call_ended push error:", err));
          }
        });
    }
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
    flipCamera,
    localStream: localStreamRef.current,
    getLocalStream: () => localStreamRef.current,
    cleanup,
  };
}
