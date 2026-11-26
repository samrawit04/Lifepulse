import { useEffect, useRef, useState } from "react";
import { Camera, Circle, Mic, MicOff, Square, SwitchCamera, VideoOff, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { uploadToCloudinary } from "@/lib/cloudinary";

export type AttachmentLike = {
  id: string;
  type: "image" | "audio" | "video" | "file";
  name: string;
  dataUrl: string;
  mimeType: string;
};

// ─── Recorder Overlay ──────────────────────────────────────────────────────────

export function RecorderOverlay({ mode, onCapture, onClose }: {
  mode: "photo" | "audio" | "video";
  onCapture: (att: AttachmentLike) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const [isRecording, setIsRecording] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Photo defaults to front (selfie) camera; video/audio default to rear
  const [facingMode, setFacingMode] = useState<"user" | "environment">(
    mode === "photo" ? "user" : "environment"
  );

  const isSelfie = facingMode === "user";

  // Start camera/mic stream — re-runs when facingMode changes
  useEffect(() => {
    let cancelled = false;
    setIsReady(false);
    setError(null);

    // Stop prior tracks before requesting a new stream
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    const constraints: MediaStreamConstraints =
      mode === "audio"
        ? { audio: true }
        : mode === "photo"
        ? { video: { facingMode }, audio: false }
        : { video: { facingMode }, audio: true };

    navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
      if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
      streamRef.current = stream;
      if (videoRef.current && mode !== "audio") {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setIsReady(true);
    }).catch((err) => {
      if (!cancelled) setError(err?.message ?? "Could not access camera/microphone.");
    });

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [mode, facingMode]);

  const flipCamera = () => {
    if (isRecording) return;
    setFacingMode((prev) => (prev === "user" ? "environment" : "user"));
  };

  const startRecording = () => {
    if (!streamRef.current) return;
    chunksRef.current = [];
    const mimeType = mode === "audio" ? "audio/webm" : "video/webm";
    const recorder = new MediaRecorder(streamRef.current, { mimeType });
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      try {
        const url = await uploadToCloudinary(blob);
        onCapture({
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          type: mode === "audio" ? "audio" : "video",
          name: `recording-${Date.now()}.${mode === "audio" ? "webm" : "webm"}`,
          dataUrl: url,
          mimeType,
        });
      } catch (e: any) {
        toast.error(`Failed to save recording: ${e.message || e}`);
      }
    };
    recorder.start();
    recorderRef.current = recorder;
    setIsRecording(true);
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    setIsRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const takePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (isSelfie) {
      // Mirror the captured frame so the selfie matches the mirrored preview
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      try {
        const url = await uploadToCloudinary(blob);
        onCapture({
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          type: "image",
          name: `photo-${Date.now()}.jpg`,
          dataUrl: url,
          mimeType: "image/jpeg",
        });
      } catch (e: any) {
        toast.error(`Failed to save photo: ${e.message || e}`);
      }
    }, "image/jpeg", 0.85);
  };

  const fmtTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-sm">
      {/* Close */}
      <div className="flex items-center justify-between px-5 py-4">
        <span className="text-sm font-medium text-white/70">
          {mode === "photo" ? "Take Photo" : mode === "audio" ? "Record Audio" : "Record Video"}
        </span>
        <button onClick={onClose} className="h-8 w-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-5">
        {error ? (
          <div className="text-center">
            <p className="text-red-400 text-sm mb-2">⚠️ {error}</p>
            <Button onClick={onClose} size="sm" variant="outline" className="border-white/20 text-white hover:bg-white/10">Close</Button>
          </div>
        ) : mode === "audio" ? (
          /* Audio UI */
          <div className="flex flex-col items-center gap-6">
            <div className={cn(
              "h-32 w-32 rounded-full flex items-center justify-center transition-all duration-300",
              isRecording
                ? "bg-red-500/20 shadow-[0_0_0_12px_rgba(239,68,68,0.1),0_0_0_24px_rgba(239,68,68,0.05)] animate-pulse"
                : "bg-white/10"
            )}>
              {isRecording ? <MicOff className="h-12 w-12 text-red-400" /> : <Mic className="h-12 w-12 text-white/60" />}
            </div>

            {isRecording && (
              <p className="text-2xl font-mono text-red-400 font-bold">{fmtTime(elapsed)}</p>
            )}

            {isReady && (
              <button
                onClick={isRecording ? stopRecording : startRecording}
                className={cn(
                  "flex items-center gap-2 px-6 py-3 rounded-full font-semibold text-sm transition-all duration-200",
                  isRecording
                    ? "bg-red-500 text-white hover:bg-red-400"
                    : "bg-white text-black hover:bg-white/90"
                )}
              >
                {isRecording ? <><Square className="h-4 w-4 fill-white" /> Stop & Save</> : <><Circle className="h-4 w-4 fill-red-500 text-red-500" /> Start Recording</>}
              </button>
            )}
          </div>
        ) : (
          /* Camera UI (photo or video) */
          <div className="flex flex-col items-center gap-4 w-full max-w-md">
            <div className="relative w-full rounded-2xl overflow-hidden bg-black/50 border border-white/10">
              {/* Mirror the preview when using front (selfie) camera */}
              <video
                ref={videoRef}
                muted
                playsInline
                className={cn(
                  "w-full h-64 sm:h-80 object-cover transition-transform duration-200",
                  isSelfie && "-scale-x-100"
                )}
              />
              {isRecording && (
                <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/60 backdrop-blur rounded-full px-3 py-1">
                  <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-xs text-white font-mono">{fmtTime(elapsed)}</span>
                </div>
              )}
              {/* Facing mode badge */}
              <div className="absolute top-3 right-3">
                <span className="text-[10px] text-white/60 bg-black/50 rounded-full px-2 py-0.5 backdrop-blur">
                  {isSelfie ? "Front" : "Rear"}
                </span>
              </div>
            </div>
            <canvas ref={canvasRef} className="hidden" />

            {isReady && (
              <div className="flex items-center gap-6">
                {/* Flip camera button */}
                <button
                  onClick={flipCamera}
                  disabled={isRecording}
                  title="Flip camera"
                  className={cn(
                    "h-10 w-10 rounded-full flex items-center justify-center border border-white/20 bg-white/10 text-white transition-all duration-150",
                    isRecording ? "opacity-30 cursor-not-allowed" : "hover:bg-white/20 active:scale-95"
                  )}
                >
                  <SwitchCamera className="h-5 w-5" />
                </button>

                {mode === "photo" ? (
                  <button
                    onClick={takePhoto}
                    className="h-16 w-16 rounded-full bg-white border-4 border-white/30 hover:scale-105 active:scale-95 transition-all duration-150 flex items-center justify-center shadow-lg"
                    title="Take photo"
                  >
                    <Camera className="h-6 w-6 text-black" />
                  </button>
                ) : (
                  <button
                    onClick={isRecording ? stopRecording : startRecording}
                    className={cn(
                      "h-16 w-16 rounded-full flex items-center justify-center border-4 transition-all duration-200 hover:scale-105 active:scale-95 shadow-lg",
                      isRecording
                        ? "bg-red-500 border-red-300 text-white"
                        : "bg-red-500 border-white/30 text-white"
                    )}
                    title={isRecording ? "Stop" : "Record"}
                  >
                    {isRecording
                      ? <Square className="h-6 w-6 fill-white" />
                      : <VideoOff className="h-6 w-6" />}
                  </button>
                )}

                {/* Spacer to visually centre the main button */}
                <div className="h-10 w-10" />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

