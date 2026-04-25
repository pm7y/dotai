import { useAtomValue } from "jotai";
import { AlertCircle, AlertTriangle } from "lucide-react";
import { diagnosticsAtom } from "@/state/lint";

type Props = {
  onJumpToFirst?: () => void;
};

export function LintPill({ onJumpToFirst }: Props) {
  const findings = useAtomValue(diagnosticsAtom);
  if (findings.length === 0) return null;
  const errors = findings.filter((f) => f.severity === "error").length;
  const warnings = findings.filter((f) => f.severity === "warning").length;
  return (
    <button
      type="button"
      onClick={onJumpToFirst}
      className="flex items-center gap-1.5 rounded bg-(--color-bg-muted) px-2 py-0.5 text-[11px] hover:opacity-80"
      title="Jump to first finding"
    >
      {errors > 0 && (
        <span className="flex items-center gap-1 text-(--color-danger)">
          <AlertCircle size={11} />
          {errors}
        </span>
      )}
      {warnings > 0 && (
        <span className="flex items-center gap-1 text-(--color-warn)">
          <AlertTriangle size={11} />
          {warnings}
        </span>
      )}
    </button>
  );
}
