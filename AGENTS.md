# BJJ Timer — agent instructions

## Objective

Complete the BJJ Timer as a reliable, usable, offline-first application.
Develop and test it in a browser on Mac first; deploy it later on a
Raspberry Pi in kiosk mode. The owner is not learning to code, and
non-technical gym staff must be able to operate the finished device.
Prioritize working results, low total API cost, and minimal owner
intervention.

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
- Prefer focused changes to rewrites. Preserve working behavior and
  avoid unrelated refactors, dependency upgrades, and new frameworks.
- Complete one feature or closely related batch per task.

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

## Execution

- For clear requests, inspect the relevant code, implement, and verify.
  Give a brief plan (3–5 bullets) inline, but do not stop after a plan
  unless approval is genuinely needed.
- Make reasonable, reversible implementation decisions yourself.
- Stop for approval when the task has unclear UX, significant
  architectural impact, new dependencies, or hardware/system effects.
- Ask questions only when missing information materially affects
  user-visible behavior, data safety, security, or scope. Ask one
  focused question rather than making a broad guess.

## Context and cost

- Read relevant files on demand; avoid dumping the whole repository.
- Do not read generated files, dependency folders, or large logs
  unless needed for the specific issue.
- Keep plans, progress updates, and final summaries concise. Do not
  provide tutorials or reproduce full source files in chat.
- Do not delegate routine tasks to multiple agents.

## Verification

- Use the repository's existing check commands: `npm test`,
  `npm run lint`, and `npm run build`. Discover and use others if the
  project adds them.
- Add or update tests when behavior changes; prefer focused tests over
  large snapshots.
- Fix regressions introduced by your changes.
- Never claim a check, browser test, or device test was performed
  unless it was. Report failures honestly.
- After two unsuccessful fixes for the same underlying issue, stop
  repeating the approach. Summarize the evidence and the blocker.

## Safety and Git

- Never include API keys, credentials, or `.env` contents in output,
  source control, or documentation. Do not read unrelated personal files.
- Do not commit, push, delete files, or make destructive Git changes
  without explicit approval.
- Ask before destructive commands, deployment, paid services, major
  dependency changes, or publishing to a remote repository.
- Do not overwrite unrelated uncommitted changes.

## Final response

Provide only:

1. What changed.
2. Checks run and their results.
3. Any remaining blocker or required manual check, plus one thing the owner should understand about the change.
