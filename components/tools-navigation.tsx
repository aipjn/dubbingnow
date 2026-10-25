"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowRight,
  AudioLines,
  ChevronDown,
  Mic,
  Sparkles,
  Video,
} from "lucide-react";
import { tools } from "@/lib/catalog";

const icons: Record<string, typeof AudioLines> = {
  sparkles: Sparkles,
  video: Video,
  mic: Mic,
  headphones: AudioLines,
};

export function ToolsNavigation() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function dismissOutside(event: PointerEvent | FocusEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target))
        setOpen(false);
    }
    function dismissWithEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    }
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("focusin", dismissOutside);
    document.addEventListener("keydown", dismissWithEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("focusin", dismissOutside);
      document.removeEventListener("keydown", dismissWithEscape);
    };
  }, [open]);

  return (
    <div className="nav-dropdown" ref={root}>
      <button
        className="nav-tools-trigger"
        type="button"
        ref={trigger}
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
      >
        Tools <ChevronDown size={15} strokeWidth={1.8} aria-hidden="true" />
      </button>
      {open && (
        <div className="nav-menu" id={menuId}>
          {tools.map((tool) => {
            const Icon = icons[tool.icon] || AudioLines;
            return (
              <Link
                key={tool.slug}
                href={`/${tool.slug}`}
                onClick={() => setOpen(false)}
              >
                <span className="nav-tool-icon">
                  <Icon size={18} strokeWidth={1.7} aria-hidden="true" />
                </span>
                <span>{tool.name}</span>
                <ArrowRight
                  className="nav-tool-arrow"
                  size={14}
                  aria-hidden="true"
                />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
