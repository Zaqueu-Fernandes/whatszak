import { useState, useEffect, useRef } from "react";
import { PhoneOff, Mic, MicOff, Video, VideoOff, SwitchCamera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { CallMode } from "@/hooks/use-webrtc";
import { useRingtone } from "@/hooks/use-ringtone";

interface ActiveCallOverlayProps {
  peerName: string;
  peerAvatar?: string;
  status: "calling" | "ringing" | "answered";
  mode: CallMode;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  onHangUp: () => void;
  onFlipCamera?: () => void;
}

export default function ActiveCallOverlay({
  peerName,
  peerAvatar,
  status,
  mode,
  localStream,
  remoteStream,
  onHangUp,
  onFlipCamera,
}: ActiveCallOverlayProps) {
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [duration, setDuration] = useState(0);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  // Play outgoing ringtone while calling/ringing (stops when answered)
  useRingtone(status === "calling" || status === "ringing", "outgoing");

  useEffect(() => {
    if (status !== "answered") return;
    const timer = setInterval(() => setDuration((d) => d + 1), 1000);
    return () => clearInterval(timer);
  }, [status]);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
      localVideoRef.current.play().catch((e) => console.warn("[Call] local video play() failed:", e));
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      console.log("[Call] attaching remote stream to video element, tracks:", remoteStream.getTracks().map((t) => t.kind));
      remoteVideoRef.current.srcObject = remoteStream;
      remoteVideoRef.current.play().catch((e) => console.warn("[Call] remote video play() failed:", e));
    }
  }, [remoteStream]);

  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach((t) => (t.enabled = muted));
    }
    setMuted((prev) => !prev);
  };

  const toggleCamera = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach((t) => (t.enabled = cameraOff));
    }
    setCameraOff((prev) => !prev);
  };

  const formatDuration = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  const initials = peerName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const statusText = status === "calling" || status === "ringing" ? "Chamando..." : formatDuration(duration);
  const isVideo = mode === "video";

  // For audio-only calls, play remote stream through an audio element
  useEffect(() => {
    if (!isVideo && remoteStream) {
      console.log("[Call] attaching remote stream to audio element, tracks:", remoteStream.getTracks().map((t) => t.kind));
      const audio = new Audio();
      audio.srcObject = remoteStream;
      audio.play().catch((e) => console.warn("[Call] remote audio play() failed:", e));
      return () => {
        audio.pause();
        audio.srcObject = null;
      };
    }
  }, [remoteStream, isVideo]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-gradient-to-b from-primary/90 to-primary py-12 px-6">
      {/* Remote video (full background) */}
      {isVideo && (
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="absolute inset-0 w-full h-full object-cover z-0"
        />
      )}

      {/* Local video (picture-in-picture) */}
      {isVideo && (
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          className="absolute top-16 right-4 w-28 h-40 rounded-xl object-cover z-10 border-2 border-primary-foreground/30 shadow-lg"
        />
      )}

      {/* Top info */}
      <div className={`flex flex-col items-center gap-4 mt-8 ${isVideo ? 'z-10' : ''}`}>
        {!isVideo && (
          <Avatar className="h-24 w-24 border-4 border-primary-foreground/30">
            <AvatarImage src={peerAvatar} />
            <AvatarFallback className="bg-primary-foreground/20 text-primary-foreground text-3xl">
              {initials}
            </AvatarFallback>
          </Avatar>
        )}
        <p className={`text-xl font-semibold ${isVideo ? 'text-white drop-shadow-lg' : 'text-primary-foreground'}`}>{peerName}</p>
        <p className={`text-sm font-mono ${isVideo ? 'text-white/80 drop-shadow' : 'text-primary-foreground/70'}`}>{statusText}</p>
      </div>

      {/* Controls */}
      <div className={`flex gap-8 mb-8 ${isVideo ? 'z-10' : ''}`}>
        <Button
          size="icon"
          variant="ghost"
          className={`h-14 w-14 rounded-full ${muted ? "bg-primary-foreground/30" : "bg-primary-foreground/10"} text-primary-foreground`}
          onClick={toggleMute}
        >
          {muted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
        </Button>

        {isVideo && (
          <Button
            size="icon"
            variant="ghost"
            className={`h-14 w-14 rounded-full ${cameraOff ? "bg-primary-foreground/30" : "bg-primary-foreground/10"} text-primary-foreground`}
            onClick={toggleCamera}
          >
            {cameraOff ? <VideoOff className="h-6 w-6" /> : <Video className="h-6 w-6" />}
          </Button>
        )}

        {isVideo && onFlipCamera && !cameraOff && (
          <Button
            size="icon"
            variant="ghost"
            className="h-14 w-14 rounded-full bg-primary-foreground/10 text-primary-foreground"
            onClick={onFlipCamera}
          >
            <SwitchCamera className="h-6 w-6" />
          </Button>
        )}

        <Button
          size="icon"
          variant="destructive"
          className="h-14 w-14 rounded-full"
          onClick={onHangUp}
        >
          <PhoneOff className="h-6 w-6" />
        </Button>
      </div>
    </div>
  );
}
