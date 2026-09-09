# Phase 12 — PWA & Installability

**Model:** Opus 5 · **Effort:** high

## Objective

Make Momentum installable from the browser so it behaves like an app — a standalone window
in Applications, a dock icon, no browser chrome — without touching Apple distribution.

This captures most of the "app experience" for a fraction of the cost of Phase 15.

## User stories

- I can install Momentum from my browser and launch it like any other app.
- It opens in its own window without browser chrome.
- Opening it while offline shows something sensible rather than a browser error page.

## Requirements

### Manifest
Name, short name, description, icons at all required sizes (including maskable), theme and
background colors matching both themes, `display: standalone`, start URL, scope, orientation.

### Service worker
- App shell cached for offline launch
- Static assets cached with a sane strategy
- A designed offline fallback page — not the browser's error
- **A correct update path.** A stale service worker serving an old bundle is worse than no
  service worker. Prompt or auto-update, but never strand the user on an old version

### Offline behavior — be honest about scope

Momentum is a database-backed app; full offline editing is out of scope. What's required:

- The app launches offline and explains its state clearly
- Cached read data may be displayed, clearly marked as potentially stale
- Mutations attempted offline fail visibly and cleanly — never silently swallowed, never
  optimistically applied and then lost

Do not claim offline capability the app doesn't have.

### Installed-window polish
- No layout assumptions that break outside a browser tab
- Correct safe-area handling on mobile
- Theme color follows the active theme
- Deep links open in the installed window

### Verification
Test the real install flow on macOS Chrome/Edge, macOS Safari, and iOS Safari. Note
per-browser limitations in `docs/ROADMAP.md`.

## Acceptance criteria

- [ ] The manifest validates and the app is installable from Chrome and Safari
- [ ] Icons render correctly at every size, including maskable
- [ ] The installed app opens standalone with no browser chrome
- [ ] The app launches while offline and shows a designed offline state
- [ ] The service worker updates reliably; no stale bundle after a deploy
- [ ] Offline mutations fail visibly and are never silently lost
- [ ] Theme color matches the active theme
- [ ] Safe areas are handled on iOS
- [ ] Lighthouse PWA installability checks pass
- [ ] No claim of offline capability the app lacks
- [ ] `pnpm typecheck`, `pnpm lint`, and `pnpm build` all exit 0

## Non-goals

Do not implement: full offline editing with sync, push notifications, background sync,
Tauri packaging (Phase 15), or App Store distribution.
