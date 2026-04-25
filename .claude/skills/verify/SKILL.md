---
name: verify
description: Run the full pre-commit verification pipeline for the dotai repo — typecheck, lint, prettier check, cargo check, clippy, cargo fmt check. Use before committing or when the user asks to "verify", "check", or "make sure everything passes".
---

# verify

Run every check that CI runs, in order, and report exactly which stage (if any) fails. **Do not** stop on first failure — collect all results before reporting, so the user can fix everything in one pass.

## Steps

Run these from the project root. Each must run; collect stdout/stderr per stage and tag with PASS or FAIL.

1. `pnpm typecheck`
2. `pnpm lint`
3. `pnpm format:check`
4. `cd src-tauri && cargo check --color never` then `cd ..`
5. `cd src-tauri && cargo clippy --no-deps --color never -- -D warnings` then `cd ..`
6. `cd src-tauri && cargo fmt --check` then `cd ..`

If any stage fails:
- Print only its tail (last ~30 lines) — full output is rarely useful.
- Suggest the fix command if obvious:
  - `pnpm format:check` fail → `pnpm format`
  - `cargo fmt --check` fail → `pnpm format:rust`
  - `cargo clippy` warning → fix the specific warning (don't suppress)
  - `pnpm lint` fail → run with `--fix` first if the rule is auto-fixable
  - `pnpm typecheck` fail → no auto-fix; the user has to address each error

## Output format

End with a one-line summary like:

```
verify: 6/6 PASS  ✓
```

or

```
verify: 4/6 PASS — failed: lint, clippy
```

That summary is the most important part of the response. Put it on its own line so it's grep-able.

## Don't

- Don't run `pnpm install` or `cargo build` — those are not part of verification.
- Don't run tests — there's no test suite yet (this is documented in README/CLAUDE.md).
- Don't try to fix things automatically. Report what failed and let the user decide.
