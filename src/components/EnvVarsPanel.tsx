import { useEffect, useState } from "react";
import { readEnvVars, type EnvVarDto } from "@/lib/tauri";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; vars: EnvVarDto[] }
  | { status: "error"; message: string };

export function EnvVarsPanel({ envVars }: { envVars: string[] }) {
  const [state, setState] = useState<State>({ status: "idle" });

  useEffect(() => {
    if (envVars.length === 0) return;
    let cancelled = false;
    setState({ status: "loading" });
    readEnvVars(envVars)
      .then((data) => {
        if (cancelled) return;
        setState({ status: "ready", vars: data });
      })
      .catch((e) => {
        if (cancelled) return;
        setState({ status: "error", message: String(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [envVars]);

  if (state.status === "loading")
    return <p className="p-4 text-xs text-(--color-fg-muted)">Loading…</p>;
  if (state.status === "error")
    return <p className="p-4 text-xs text-(--color-danger)">Error: {state.message}</p>;
  if (state.status === "idle") return null;

  return (
    <div className="flex-1 overflow-auto p-3">
      <p className="mb-2 text-[11px] text-(--color-fg-muted)">
        Read-only view. Values containing key/token/secret/password are masked.
      </p>
      <table className="w-full table-fixed border-collapse text-[12px]">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-(--color-fg-muted)">
            <th className="w-1/3 border-b border-(--color-border) px-2 py-1">Name</th>
            <th className="border-b border-(--color-border) px-2 py-1">Value</th>
          </tr>
        </thead>
        <tbody>
          {state.vars.map((v) => (
            <tr
              key={v.name}
              className="border-b border-(--color-border)/40 hover:bg-(--color-bg-muted)"
            >
              <td className="px-2 py-1 font-mono">{v.name}</td>
              <td className="truncate px-2 py-1 font-mono text-(--color-fg-muted)">
                {v.set ? (
                  <span className={v.masked ? "text-(--color-warn)" : ""}>
                    {v.value}
                  </span>
                ) : (
                  <span className="opacity-50">— not set</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
