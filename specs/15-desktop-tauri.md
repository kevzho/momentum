# Phase 15 — Desktop (Tauri) & macOS Distribution  *(post-MVP)*

**Model:** Opus 5 · **Effort:** xhigh

## Objective

Wrap the existing web application in a Tauri shell and add the macOS integrations that
actually justify a desktop app. Then sign, notarize, and distribute it.

**Do not start this until the web app has real users.** The value of Momentum is the
planner, not the packaging. Ship Phases 0–13 and get 10–30 people genuinely using the
weekly planner first.

## The architectural rule

> The web application is the canonical product. The desktop application **wraps and
> extends** the shared application; it does not become an independent implementation.
>
> Domain logic, scheduling algorithms, task management, gamification, analytics, database
> types, and reusable UI stay shared wherever platform constraints permit.
> macOS-specific code is isolated behind a **desktop capabilities layer**.

If you find yourself reimplementing a feature for desktop, stop — that's the failure mode
this phase exists to avoid.

## Requirements

### 1. Tauri shell

`apps/desktop` wrapping the shared frontend. Auth session handling that works in the shell.
Correct deep-linking. Auto-update configured.

### 2. Capabilities layer

A single interface the shared code calls, with a no-op web implementation and a real
desktop implementation:

```
capabilities.notify(…)          web: no-op or Web Notifications
capabilities.setMenuBar(…)      web: no-op
capabilities.registerGlobalShortcut(…)   web: no-op
capabilities.setBadge(…)        web: no-op
```

Shared code never branches on platform. It calls the capability; the implementation differs.

### 3. macOS features — the reason this phase exists

- **Menu-bar focus timer** — `○ 32:14` visible while working, with pause/finish
- **Global Quick Add** — ⌘⇧Space captures a task from anywhere in the OS
- **Native notifications** — "Research block starts in 10 minutes"
- **Dock badge** — remaining tasks today
- **Native keyboard shortcuts**
- **Calendar integration** — later, and only if it earns its complexity

The menu-bar timer and the global quick-add are the two features that make the desktop app
meaningfully better than a browser tab. Prioritize them.

### 4. Universal build

Build for both `arm64` and `x86_64` and produce a universal binary, unless a check of
Apple's current guidance at build time indicates Apple Silicon only is now appropriate.
Apple's position on Intel support has been shifting — **verify current requirements rather
than trusting this document.**

### 5. Signing, notarization, distribution

Target: direct distribution from the website, not the Mac App Store, for the first release.
No review process, full control of updates, and no sandbox entitlement work.

```
Momentum.app → Developer ID signing → Hardened Runtime
             → Apple notarization → stapled ticket
             → Momentum.dmg → website → any Mac
```

Automate everything that can be automated: build, universal binary assembly, DMG creation.

**Signing credential handling — read this before touching it:**

The Apple Developer Program account holder must be of legal age, so the account is held by
an adult (in this project, Kevin's mom). That is a legitimate arrangement. The rules that
go with it are not optional:

- The account holder **retains control of the Apple Account and the signing credentials.**
- **Do not share the account holder's Apple Account login.** Do not act as the account
  holder. Do not attempt to automate a login on their behalf.
- Only the account holder can create a Developer ID certificate.
- Design the release process so the **signing step is one clearly-documented action the
  account holder performs**, on their machine or with credentials they control — not a
  secret pasted into a repo or CI variable by someone else.
- Everything up to signing (build, universal binary, packaging) should be fully automated
  and reproducible so the human step is short and unambiguous.
- Individual accounts can invite users to App Store Connect, but invited users are not full
  program members and do not get certificate access. Don't design around assuming otherwise.

If the project later gets its own developer account, Apple supports transferring qualifying
App Store apps between accounts under certain conditions. Design with future transferability
in mind — stable bundle ID, no assumptions that only hold under the current account — rather
than assuming any configuration can transfer.

**Verify all Apple requirements against current documentation when you do this work.**
Apple's signing, notarization, and architecture-support requirements change; this file will
go stale.

### 6. Release documentation

Write `docs/RELEASE.md`: the full build → sign → notarize → staple → package → publish
sequence, with the account-holder step called out explicitly and the credential rules
restated.

## Acceptance criteria

- [ ] The desktop app runs the shared frontend with no forked feature implementations
- [ ] Auth works in the shell and sessions persist
- [ ] The capabilities layer exists with web no-op and desktop implementations
- [ ] No shared code branches on platform
- [ ] Menu-bar focus timer shows live remaining time and supports pause/finish
- [ ] Global Quick Add works system-wide
- [ ] Native notifications fire for upcoming blocks
- [ ] Dock badge reflects remaining tasks
- [ ] A universal binary builds (or the arm64-only decision is documented with its reason)
- [ ] The app is signed with Developer ID and hardened runtime
- [ ] The app is notarized and the ticket is stapled
- [ ] Gatekeeper accepts the DMG on a clean machine
- [ ] Auto-update works end to end
- [ ] `docs/RELEASE.md` documents the process, including the account-holder signing step
- [ ] No Apple Account credentials appear in the repository, CI, or any config file
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build` all exit 0 for both apps

## Non-goals

Do not implement: Mac App Store submission, Windows or Linux builds, a separate Swift/
SwiftUI implementation, full offline sync, or Apple Calendar two-way sync (read-only first,
if at all).
