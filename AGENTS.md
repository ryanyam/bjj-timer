# BJJ Timer — agent instructions

## Purpose

Build a reliable, offline-first BJJ gym timer. Develop and test it in
a browser on Mac first; deploy it later on a Raspberry Pi in kiosk mode.
Non-technical gym staff must be able to operate the finished device.

## Source of truth

- Inspect the current code, tests, and Git status before making claims
  about what is implemented.
- Treat this file as product constraints, not proof that a feature exists.
- Do not invent file names, functions, test results, or completed milestones.
- If a request conflicts with the code or these constraints, flag the
  conflict and propose the smallest resolution.

## Stack and scope

- React, TypeScript, Vite, and the project's existing test tooling.
- Keep the runtime usable offline. Do not add a backend, database,
  login, cloud sync, analytics, or an AI dependency.
- Do not add packages or change the architecture without approval.
- Prefer focused changes to rewrites. Preserve working behavior.

## Product constraints

- The intended finished timer has exactly two operator inputs:
  Main and Mode/Option. On-screen controls may simulate these during
  browser development; physical-button integration comes later.
- Main short press performs the appropriate action for the current
  timer state. Main long press resets regardless of state. Its visible
  label should match its current short-press action.
- Mode short press selects a training preset. Mode long press selects
  an option within a mode. Define precise behavior and edge cases
  before implementing new mode interactions.
- Keep physical input, browser input, and timer behavior separate so
  future GPIO events can trigger the same application actions.
- Defer combined-button shutdown and system-level power control until
  the hardware/deployment milestone. Do not implement them incidentally.

## Timer correctness

- Calculate remaining time from timestamps or elapsed time; do not
  decrement a counter once per second as the source of truth.
- Handle delayed ticks, backgrounded tabs, completion, reset, and
  cleanup without duplicate transitions.
- Keep timing calculations independently testable where practical.
- Do not change the meaning of Start, Reset, Pause, or Mode silently;
  call out a proposed behavior change before implementing it.

## How to work

1. Inspect only the files relevant to the request and summarize the
   intended change in 3–5 bullets. Mention decisions I must make.
2. If the task has unclear UX, significant architectural impact,
   new dependencies, or hardware/system effects, stop for approval.
   For a clear, small, reversible request, proceed after the brief
   plan without waiting for a second "yes".
3. Implement only the agreed scope. Add or update tests when behavior
   changes; prefer focused tests over large snapshots.
4. Run `npm test`, `npm run lint`, and `npm run build` after code
   changes. Report failures honestly; never claim checks were run
   when they were not.
5. Tell me the files changed, results of the checks, a short manual
   browser test, and one thing I should understand about the change.

## Safety and Git

- Never include API keys, credentials, or `.env` contents in output,
  source control, or documentation.
- Do not commit, push, delete files, or make destructive Git changes
  without my explicit approval.
- Do not overwrite unrelated uncommitted changes.
- If an instruction is uncertain, ask one focused question rather
  than making a broad guess.
