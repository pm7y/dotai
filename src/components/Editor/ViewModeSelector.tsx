import type { ViewMode } from "@/lib/preferences-store";

type Props = {
  value: ViewMode;
  onChange: (next: ViewMode) => void;
};

const OPTIONS: { mode: ViewMode; label: string }[] = [
  { mode: "edit", label: "Edit" },
  { mode: "split", label: "Split" },
  { mode: "preview", label: "Preview" },
];

export function ViewModeSelector({ value, onChange }: Props) {
  return (
    <div
      role="radiogroup"
      aria-label="Editor view mode"
      className="flex overflow-hidden rounded border border-(--color-border) text-[11px]"
    >
      {OPTIONS.map(({ mode, label }) => {
        const active = mode === value;
        return (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(mode)}
            className={
              active
                ? "bg-(--color-accent) px-2 py-0.5 text-(--color-accent-fg)"
                : "px-2 py-0.5 hover:bg-(--color-bg-muted)"
            }
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
