import { useEffect } from "react";
import { ExternalLink, X } from "lucide-react";
import { openDocs } from "@/lib/docs-links";
import iconUrl from "/icon.svg";

const APP_NAME = "dotai";
const APP_VERSION = "0.1.0";
const TAGLINE =
  "Lists, edits, watches, and searches every Claude Code, Claude Desktop, and Copilot CLI config file across global and project scopes.";
const HOMEPAGE = "https://github.com/pmcilreavy/dotai";

const STACK = [
  { name: "Tauri 2", url: "https://tauri.app" },
  { name: "React 19", url: "https://react.dev" },
  { name: "TypeScript", url: "https://typescriptlang.org" },
  { name: "Tailwind v4", url: "https://tailwindcss.com" },
  { name: "CodeMirror 6", url: "https://codemirror.net" },
  { name: "Jotai", url: "https://jotai.org" },
];

export function AboutDialog({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="about-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="relative w-[480px] max-w-[90vw] overflow-hidden rounded-xl border border-(--color-border) bg-(--color-bg) shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 rounded p-1 text-(--color-fg-muted) hover:bg-(--color-bg-muted) hover:text-(--color-fg)"
        >
          <X size={14} />
        </button>

        <div className="flex flex-col items-center px-6 pb-2 pt-8">
          <img src={iconUrl} alt="" className="mb-4 h-20 w-20 rounded-2xl shadow-md" />
          <h2 id="about-title" className="text-2xl font-semibold tracking-tight">
            {APP_NAME}
          </h2>
          <p className="mt-1 text-[12px] font-mono text-(--color-fg-muted)">
            v{APP_VERSION}
          </p>
        </div>

        <div className="px-6 pb-5 pt-3">
          <p className="text-center text-[13px] leading-relaxed text-(--color-fg-muted)">
            {TAGLINE}
          </p>
        </div>

        <div className="border-t border-(--color-border) px-6 py-4">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-(--color-fg-muted)">
            Built with
          </p>
          <ul className="flex flex-wrap gap-x-3 gap-y-1.5 text-[12px]">
            {STACK.map((s) => (
              <li key={s.name}>
                <button
                  type="button"
                  onClick={() => openDocs(s.url)}
                  className="text-(--color-fg) hover:text-(--color-accent) hover:underline"
                >
                  {s.name}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <footer className="flex items-center justify-between border-t border-(--color-border) bg-(--color-bg-subtle) px-6 py-3 text-[11px] text-(--color-fg-muted)">
          <span>© 2026 Paul McIlreavy · No telemetry</span>
          <button
            type="button"
            onClick={() => openDocs(HOMEPAGE)}
            className="flex items-center gap-1 text-(--color-accent) hover:underline"
          >
            GitHub
            <ExternalLink size={10} />
          </button>
        </footer>
      </div>
    </div>
  );
}
