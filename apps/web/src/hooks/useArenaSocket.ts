"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { apiClient } from "@/lib/api-client";
import { USE_MOCK } from "@/lib/auth";

interface ChatMessage {
  id: string;
  role: "nexi" | "user";
  content: string;
  timestamp: string;
}

interface EvaluationResult {
  comprehension?: "strong" | "partial" | "weak";
  reasoning_quality?: "strong" | "partial" | "weak";
  engagement?: "high" | "medium" | "low";
  decision?: "advance" | "stay" | "retreat";
  reason?: string;
  familiarity?: "none" | "basic" | "intermediate" | "advanced";
  teach_depth?: "foundational" | "intermediate" | "advanced";
}

interface ScaffoldUpdate {
  mode: string;
  mode_index: number;
  observation: string;
  consider: string[];
  next_mode?: string;
  evaluation?: EvaluationResult;
}

interface OutlineSection {
  id: number;
  title: string;
  description: string;
  key_concepts: string[];
  estimated_exchanges: number;
  visuals?: Array<{
    type: string;
    title?: string;
    caption?: string;
    content?: string;
    chart_type?: string;
    data?: Array<{ name: string; value: number }>;
    headers?: string[];
    rows?: string[][];
  }>;
}

interface UseArenaSocketReturn {
  messages: ChatMessage[];
  isConnected: boolean;
  isStreaming: boolean;
  streamingContent: string;
  scaffold: ScaffoldUpdate | null;
  currentMode: string;
  lastEvaluation: EvaluationResult | null;
  courseOutline: OutlineSection[];
  currentTopicId: number;
  topicsCovered: number[];
  sendMessage: (content: string) => void;
  connect: (conversationId: string, quizResult?: { teach_depth: string; skip_to_mode: string; familiarity: string; percentage: number }) => void;
  disconnect: () => void;
  loadExistingMessages: (msgs: Array<{ role: string; content: string; timestamp: string }>, sessionMode?: string) => void;
}

export function useArenaSocket(): UseArenaSocketReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [scaffold, setScaffold] = useState<ScaffoldUpdate | null>(null);
  const [currentMode, setCurrentMode] = useState("assess");
  const [lastEvaluation, setLastEvaluation] = useState<EvaluationResult | null>(null);
  const [courseOutline, setCourseOutline] = useState<OutlineSection[]>([]);
  const [currentTopicId, setCurrentTopicId] = useState<number>(1);
  const [topicsCovered, setTopicsCovered] = useState<number[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const msgIdCounter = useRef(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasGreetedRef = useRef(false);

  const clearResponseTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const startResponseTimeout = useCallback(() => {
    clearResponseTimeout();
    timeoutRef.current = setTimeout(() => {
      setIsStreaming(false);
      setStreamingContent("");
      setMessages((prev) => [
        ...prev,
        {
          id: `nexi-${++msgIdCounter.current}`,
          role: "nexi",
          content:
            "Sorry, I took too long to respond. Could you try sending that again?",
          timestamp: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
        },
      ]);
    }, 60000);
  }, [clearResponseTimeout]);

  const connect = useCallback((conversationId: string, quizResult?: { teach_depth: string; skip_to_mode: string; familiarity: string; percentage: number }) => {
    // Use real WebSocket if it's a real UUID (not "session-1" mock ID)
    const isRealId = conversationId.includes("-") && conversationId.length > 30;
    if (USE_MOCK && !isRealId) {
      setIsConnected(true);
      return;
    }

    // Close any existing WebSocket first (React Strict Mode double-mount guard)
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    const url = apiClient.getWebSocketUrl(conversationId);
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      if (!isRealId) return;

      if (!hasGreetedRef.current) {
        // New session — send session_start to trigger Nexi's greeting
        hasGreetedRef.current = true;
        const startPayload: Record<string, unknown> = { type: "session_start" };
        if (quizResult) {
          startPayload.quiz_result = quizResult;
          const startMode = quizResult.skip_to_mode === "challenge" ? "challenge" : "teach";
          setCurrentMode(startMode);
        }
        ws.send(JSON.stringify(startPayload));
        setIsStreaming(true);
        startResponseTimeout();
      } else {
        // Resumed session — request outline/scaffold state without triggering a new greeting
        // Server handles this gracefully: sends outline_update + scaffold_update for existing sessions
        ws.send(JSON.stringify({ type: "session_start" }));
      }
    };
    ws.onclose = () => setIsConnected(false);
    ws.onerror = () => setIsConnected(false);

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case "assistant_token":
          clearResponseTimeout();
          setIsStreaming(true);
          setStreamingContent((prev) => prev + data.content);
          break;

        case "assistant_complete":
          clearResponseTimeout();
          setIsStreaming(false);
          setMessages((prev) => [
            ...prev,
            {
              id: `nexi-${++msgIdCounter.current}`,
              role: "nexi",
              content: data.content,
              timestamp: new Date().toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              }),
            },
          ]);
          setStreamingContent("");
          break;

        case "scaffold_update":
          setScaffold({
            mode: data.mode,
            mode_index: data.mode_index,
            observation: data.observation,
            consider: data.consider,
            next_mode: data.next_mode,
            evaluation: data.evaluation,
          });
          setCurrentMode(data.next_mode || data.mode);
          if (data.evaluation) setLastEvaluation(data.evaluation);
          break;

        case "mode_update":
          setCurrentMode(data.mode);
          break;

        case "outline_update":
          setCourseOutline(data.outline || []);
          setCurrentTopicId(data.current_topic_id || 1);
          setTopicsCovered(data.topics_covered || []);
          break;

        case "topic_visual":
        case "inline_visual": {
          // Extract visual_type before spreading — ...data would overwrite type with "topic_visual"
          const { type: _wsType, ...visualPayload } = data;
          setMessages((prev) => [...prev, {
            id: `visual-${++msgIdCounter.current}`,
            role: "nexi" as const,
            content: JSON.stringify({ _visual: true, type: data.visual_type || _wsType, ...visualPayload }),
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          }]);
          break;
        }

        case "error":
          console.error("WebSocket error:", data.content);
          clearResponseTimeout();
          setIsStreaming(false);
          break;
      }
    };
  }, [startResponseTimeout, clearResponseTimeout]);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    setIsConnected(false);
  }, []);

  const loadExistingMessages = useCallback((msgs: Array<{ role: string; content: string; timestamp: string }>, sessionMode?: string) => {
    const loaded: ChatMessage[] = msgs.map((m) => ({
      id: `loaded-${++msgIdCounter.current}`,
      role: m.role === "user" ? "user" : "nexi",
      content: m.content,
      timestamp: new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    }));
    setMessages(loaded);
    // Mark as greeted since this conversation already has messages
    hasGreetedRef.current = true;
    // Restore the session mode so the stepper shows the correct phase
    if (sessionMode) {
      setCurrentMode(sessionMode);
    }
  }, []);

  const sendMessage = useCallback(
    (content: string) => {
      const userMsg: ChatMessage = {
        id: `user-${++msgIdCounter.current}`,
        role: "user",
        content,
        timestamp: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };
      setMessages((prev) => [...prev, userMsg]);

      // If no WebSocket connection (pure mock mode with no real backend), simulate
      if (!wsRef.current) {
        setIsStreaming(true);
        const mockResponse =
          "That's an interesting perspective. Let me challenge that assumption — what evidence do you have that supports this approach? And what would someone who disagrees with you say about it?";
        let i = 0;
        const interval = setInterval(() => {
          if (i < mockResponse.length) {
            setStreamingContent(mockResponse.slice(0, i + 3));
            i += 3;
          } else {
            clearInterval(interval);
            setIsStreaming(false);
            setMessages((prev) => [
              ...prev,
              {
                id: `nexi-${++msgIdCounter.current}`,
                role: "nexi",
                content: mockResponse,
                timestamp: new Date().toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                }),
              },
            ]);
            setStreamingContent("");
          }
        }, 20);
        return;
      }

      wsRef.current.send(
        JSON.stringify({ type: "user_message", content })
      );
      startResponseTimeout();
    },
    []
  );

  useEffect(() => {
    return () => {
      clearResponseTimeout();
      wsRef.current?.close();
    };
  }, [clearResponseTimeout]);

  return {
    messages,
    isConnected,
    isStreaming,
    streamingContent,
    scaffold,
    currentMode,
    lastEvaluation,
    courseOutline,
    currentTopicId,
    topicsCovered,
    sendMessage,
    connect,
    disconnect,
    loadExistingMessages,
  };
}
