import { describe, it, expect } from "vitest";
import { nextSelectionForPath } from "./open-ref";
import type { Selection } from "@/state/selection";

const base: Selection = {
  tool: null,
  scope: null,
  entryId: "claude-code-user-claudemd",
  filePath: "/Users/alice/CLAUDE.md",
};

describe("nextSelectionForPath", () => {
  it("returns a synthetic-entry selection when no lookup is given", () => {
    const next = nextSelectionForPath("/Users/alice/.claude/skills/x/SKILL.md", base);
    expect(next.entryId).toBeNull();
    expect(next.filePath).toBe("/Users/alice/.claude/skills/x/SKILL.md");
    expect(next.syntheticEntry?.id).toBe(
      "adhoc:/Users/alice/.claude/skills/x/SKILL.md",
    );
    expect(next.syntheticEntry?.label).toBe("SKILL.md");
  });

  it("uses the catalog lookup when one is provided and matches", () => {
    const next = nextSelectionForPath("/etc/hosts", base, {
      findCatalogEntryByPath: (p) =>
        p === "/etc/hosts"
          ? {
              id: "demo",
              tool: "claude-code",
              scope: "user",
              category: "settings",
              label: "hosts",
              pathTemplate: "/etc/hosts",
              kind: "file",
              language: "json",
              docsUrl: "https://example.com",
            }
          : null,
    });
    expect(next.entryId).toBe("demo");
    expect(next.filePath).toBe("/etc/hosts");
    expect(next.syntheticEntry).toBeUndefined();
  });

  it("falls back to synthetic when the lookup returns null", () => {
    const next = nextSelectionForPath("/nope/x.md", base, {
      findCatalogEntryByPath: () => null,
    });
    expect(next.entryId).toBeNull();
    expect(next.syntheticEntry?.id).toBe("adhoc:/nope/x.md");
  });
});
