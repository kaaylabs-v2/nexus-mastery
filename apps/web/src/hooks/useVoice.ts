"use client";

import { useState, useRef, useCallback, useEffect } from "react";

// ── VAD Config ──────────────────────────────────────────────────────────────
const SILENCE_THRESHOLD = 0.015; // RMS below this = silence
const SILENCE_DURATION_MS = 1400; // 1.4s of silence triggers auto-stop
const CHECK_INTERVAL_MS = 100; // Check audio level every 100ms

interface UseVoiceReturn {
  // Recording
  isRecording: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<Blob | null>;

  // TTS playback
  isPlaying: boolean;
  playAudioBuffer: (audioBuffer: ArrayBuffer) => Promise<void>;
  stopAudio: () => void;

  // Voice mode (continuous conversation)
  voiceMode: boolean;
  setVoiceMode: (on: boolean) => void;
  audioLevel: number; // 0-1 for visualizations
}

export function useVoice(opts?: {
  /** Called when VAD detects silence and auto-stops recording */
  onSilenceDetected?: (blob: Blob) => void;
  /** Called when TTS playback finishes */
  onPlaybackEnded?: () => void;
}): UseVoiceReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [voiceMode, setVoiceModeState] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // VAD refs
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const vadIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const silenceStartRef = useRef<number | null>(null);
  const hasSpokenRef = useRef(false);

  // Clean up VAD interval
  const stopVAD = useCallback(() => {
    if (vadIntervalRef.current) {
      clearInterval(vadIntervalRef.current);
      vadIntervalRef.current = null;
    }
    setAudioLevel(0);
  }, []);

  // Start VAD monitoring
  const startVAD = useCallback((stream: MediaStream) => {
    try {
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      analyserRef.current = analyser;
      silenceStartRef.current = null;
      hasSpokenRef.current = false;

      const dataArray = new Float32Array(analyser.fftSize);

      vadIntervalRef.current = setInterval(() => {
        if (!analyserRef.current) return;
        analyserRef.current.getFloatTimeDomainData(dataArray);

        // Calculate RMS
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i] * dataArray[i];
        }
        const rms = Math.sqrt(sum / dataArray.length);
        setAudioLevel(Math.min(rms * 10, 1)); // Normalize for UI

        if (rms > SILENCE_THRESHOLD) {
          // User is speaking
          hasSpokenRef.current = true;
          silenceStartRef.current = null;
        } else if (hasSpokenRef.current) {
          // Silence after speech
          if (!silenceStartRef.current) {
            silenceStartRef.current = Date.now();
          } else if (Date.now() - silenceStartRef.current > SILENCE_DURATION_MS) {
            // Silence long enough — auto-stop
            stopVAD();
            // Trigger stop via the recorder
            const recorder = mediaRecorderRef.current;
            if (recorder && recorder.state === "recording") {
              recorder.stop();
            }
          }
        }
      }, CHECK_INTERVAL_MS);
    } catch (err) {
      console.error("[VAD] Failed to start:", err);
    }
  }, [stopVAD]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      // When recording stops (either manual or VAD-triggered)
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        // Stop tracks
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setIsRecording(false);
        stopVAD();

        // If we have audio and the onSilenceDetected callback, call it
        if (blob.size > 0 && hasSpokenRef.current && opts?.onSilenceDetected) {
          opts.onSilenceDetected(blob);
        }
      };

      mediaRecorder.start(250); // Collect chunks every 250ms for faster processing
      setIsRecording(true);
      hasSpokenRef.current = false;

      // Start VAD
      startVAD(stream);
    } catch (err) {
      console.error("[Voice] Microphone access denied:", err);
    }
  }, [startVAD, stopVAD, opts]);

  const stopRecording = useCallback(async (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        setIsRecording(false);
        stopVAD();
        resolve(null);
        return;
      }

      // Override the onstop to resolve the promise
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
        setIsRecording(false);
        stopVAD();
        resolve(blob);
      };

      recorder.stop();
    });
  }, [stopVAD]);

  const playAudioBuffer = useCallback(async (audioBuffer: ArrayBuffer) => {
    const blob = new Blob([audioBuffer], { type: "audio/mpeg" });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audioRef.current = audio;

    return new Promise<void>((resolve) => {
      let resolved = false;
      const cleanup = () => {
        if (resolved) return;
        resolved = true;
        setIsPlaying(false);
        URL.revokeObjectURL(url);
        clearTimeout(safetyTimer);
        opts?.onPlaybackEnded?.();
        resolve();
      };

      // Safety timeout — force cleanup if playback gets stuck
      const safetyTimer = setTimeout(cleanup, 60000);

      audio.onplay = () => setIsPlaying(true);
      audio.onended = cleanup;
      audio.onerror = cleanup;
      audio.play().catch(cleanup);
    });
  }, [opts]);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
    }
  }, []);

  const setVoiceMode = useCallback((on: boolean) => {
    setVoiceModeState(on);
    if (!on) {
      // Exiting voice mode — stop everything
      stopAudio();
      stopVAD();
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state === "recording") {
        recorder.stop();
      }
    }
  }, [stopAudio, stopVAD]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopVAD();
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, [stopVAD]);

  return {
    isRecording,
    startRecording,
    stopRecording,
    isPlaying,
    playAudioBuffer,
    stopAudio,
    voiceMode,
    setVoiceMode,
    audioLevel,
  };
}
