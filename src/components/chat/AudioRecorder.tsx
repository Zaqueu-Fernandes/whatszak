import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Send, Trash2 } from "lucide-react";

interface AudioRecorderProps {
  onRecorded: (blob: Blob) => void;
  disabled?: boolean;
}

export default function AudioRecorder({ onRecorded, disabled }: AudioRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  // What to do once the recorder actually stops (stopping is async) — set by
  // whichever of the trash/send buttons was tapped.
  const pendingActionRef = useRef<"send" | "discard" | null>(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        clearInterval(timerRef.current);
        if (pendingActionRef.current === "send" && chunksRef.current.length > 0) {
          onRecorded(new Blob(chunksRef.current, { type: "audio/webm" }));
        }
        pendingActionRef.current = null;
        chunksRef.current = [];
        setRecording(false);
        setDuration(0);
      };

      mediaRecorder.start();
      setRecording(true);
      setDuration(0);
      timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
    } catch {
      console.error("Microphone access denied");
    }
  };

  // Tapping trash or send while still recording stops AND resolves in one
  // step — no separate "stop, then decide" screen, matching WhatsApp.
  const finishRecording = (action: "send" | "discard") => {
    pendingActionRef.current = action;
    mediaRecorderRef.current?.stop();
  };

  const formatDuration = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  if (recording) {
    return (
      <div className="flex items-center gap-2 flex-1">
        <Button
          size="icon"
          variant="ghost"
          className="rounded-full h-10 w-10 text-destructive hover:text-destructive"
          onClick={() => finishRecording("discard")}
        >
          <Trash2 className="h-5 w-5" />
        </Button>
        <span className="h-2.5 w-2.5 rounded-full bg-destructive animate-pulse shrink-0" />
        <span className="text-sm font-mono text-destructive">{formatDuration(duration)}</span>
        <div className="flex-1" />
        <Button size="icon" className="rounded-full h-10 w-10" onClick={() => finishRecording("send")}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <Button
      size="icon"
      variant="ghost"
      className="rounded-full h-10 w-10 text-muted-foreground"
      onClick={startRecording}
      disabled={disabled}
    >
      <Mic className="h-5 w-5" />
    </Button>
  );
}
