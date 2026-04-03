"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BookPlus } from "lucide-react";

interface VocabSelectionPopoverProps {
  containerRef: React.RefObject<HTMLElement | null>;
  onSaveVocab: (term: string) => void;
}

export function VocabSelectionPopover({ containerRef, onSaveVocab }: VocabSelectionPopoverProps) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [selectedText, setSelectedText] = useState("");
  const popoverRef = useRef<HTMLDivElement>(null);

  const handleMouseUp = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !containerRef.current) {
      setVisible(false);
      return;
    }

    const text = selection.toString().trim();
    if (text.length < 2 || text.length > 100) {
      setVisible(false);
      return;
    }

    // Check if selection is inside our container
    const range = selection.getRangeAt(0);
    if (!containerRef.current.contains(range.commonAncestorContainer)) {
      setVisible(false);
      return;
    }

    const rect = range.getBoundingClientRect();
    const containerRect = containerRef.current.getBoundingClientRect();

    setSelectedText(text);
    setPosition({
      top: rect.top - containerRect.top - 40,
      left: rect.left - containerRect.left + rect.width / 2,
    });
    setVisible(true);
  }, [containerRef]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener("mouseup", handleMouseUp);
    return () => container.removeEventListener("mouseup", handleMouseUp);
  }, [containerRef, handleMouseUp]);

  // Hide on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setVisible(false);
      }
    };
    if (visible) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [visible]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          ref={popoverRef}
          initial={{ opacity: 0, y: 4, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 4, scale: 0.95 }}
          transition={{ duration: 0.15 }}
          className="absolute z-50"
          style={{ top: position.top, left: position.left, transform: "translateX(-50%)" }}
        >
          <button
            onClick={() => {
              onSaveVocab(selectedText);
              setVisible(false);
              window.getSelection()?.removeAllRanges();
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-card border border-border shadow-lg px-3 py-2 text-xs font-medium text-foreground hover:bg-accent transition-colors whitespace-nowrap"
          >
            <BookPlus className="h-3.5 w-3.5 text-primary" />
            Save as vocab term
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
