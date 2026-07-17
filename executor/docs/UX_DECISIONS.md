# Passkey UX decisions

Rationale for the passkey wallet's user-facing flow. Written for whoever
touches `src/ui.ts`, `src/index.ts`, `src/errors.ts`, or `src/i18n.ts` next —
the *why* behind choices that otherwise look arbitrary or safe to "simplify".

## Audience

Web2 users with no crypto background. They have never seen a seed phrase, do
not know what "resident key" or "assertion" means, and read the buttons, not
the docs. Every decision below trades crypto-native precision for that user's
comprehension and safety.

## 1. Web2-familiar entry: "Sign up" / "Sign in"

The entry dialog (`ui.promptSignInChoice`) uses **Sign up** (create a new
account) and **Sign in** (use an existing passkey) — not "Create new account"
/ "Use existing passkey". These are the two words every Web2 user already
maps to "I'm new here" vs "I've been here before". The internal choice values
stay `create` / `existing`; only the labels changed.

Tagline: "No password, no seed phrase — just your device." Names the benefit
in the user's terms, not the mechanism (WebAuthn/passkey).

## 2. Zero-friction first sign-up

On **Sign up**, if there are **no** local passkey records
(`passkey:known` empty), we do **not** prompt for anything. The passkey is
labelled with the default `DEFAULT_PASSKEY_LABEL` ("Trezu.org Account") and we
go straight to the device ceremony (Face ID / fingerprint / PIN).

Why: a first-time user asked to "name your passkey" has no idea what to type,
what it affects, or whether it is public. The field is pure confusion tax at
the exact moment we want the funnel frictionless. The label is only ever shown
in the OS passkey manager, so a sensible default costs the user nothing.

## 3. Label prompt only for additional accounts

We ask for a label (`ui.promptPasskeyLabel`, a username or email) **only** when
the user already has a passkey on this device and is creating **another**
account. Now the label earns its keep: it is the only thing distinguishing two
Trezu entries in the device's passkey manager. Empty input still falls back to
the default label.

Decision gate: `Object.keys(await storage.getKnownCredentials()).length === 0`
→ first account (no prompt) vs additional (prompt).

## 4. Resident keys + user verification are non-negotiable

Not cosmetic, but they shape the UX, so they belong here:

- **Resident (discoverable) keys required.** A non-resident key has no
  recovery path (nothing to hand to `allowCredentials`, discovery can't find
  it) — the account would silently vanish. We reject `credProps.rk === false`.
- **User verification required** on every ceremony, and the UV flag is
  re-checked on each assertion. A wallet must never sign on a bare
  security-key touch (presence only). This can turn away PIN-less security
  keys — an intentional trade of reach for safety.

These constraints surface to the user only as errors, which is why the error
copy (below) must be actionable.

## 5. Errors speak human, and never blame the user's device by default

`src/errors.ts` maps every WebAuthn `DOMException` to a short, plain sentence
that says what to DO. Guiding rules:

- The common case (`NotAllowedError`) is cancel/timeout — phrase it as "try
  again", never "your device failed". Users cancel far more often than
  hardware breaks.
- `InvalidStateError` (duplicate passkey) routes the user to **Sign in**, not
  a dead end.
- Missing PIN / screen lock (`ConstraintError`) tells them exactly which
  setting to enable.
- Raw `DOMException.name`/`.message` never reach the user.

## 6. Fresh user-gesture before every dApp-initiated ceremony

Signing a transaction/message and confirming a returning sign-in each show a
one-button `ui.promptConfirm` immediately before the WebAuthn call, with **no
network await between the click and `navigator.credentials.get()`**. iOS/Safari
require transient user activation for the ceremony; a button tap guarantees it
and doubles as an explicit "you are about to sign" confirmation.

Do not move network calls (account existence, nonce fetch that hits RPC, etc.)
between that tap and the ceremony — it breaks passkeys on iOS.

## 7. Device-neutral wording

Prompts say "your device", not "Face ID / Touch ID", because the wallet runs
on Windows Hello, Android screen lock, and security keys too. Concrete
mechanisms are listed only inside error messages, where enumerating the
options ("Face ID, a fingerprint, a screen lock, or a PIN") helps the user
find the setting.

## 8. Motion & visual design — native biometric hand-off

The overlay should feel like the system's own Face ID / Touch ID / Windows
Hello / Android screen-lock sheet, not a web modal bolted on. All of it lives
in one injected stylesheet in `ui.ts` (no runtime deps), so it renders
identically on every host.

- **Translucent material card.** `backdrop-filter: blur(30px) saturate(180%)`
  over a semi-transparent surface, hairline border, deep soft shadow — the
  iOS "thick material" look. Light and dark variants via
  `prefers-color-scheme`.
- **Materialize entrance.** Each screen scales up from `0.94` with a tiny
  overshoot to `1.0` on the iOS spring ease `cubic-bezier(0.32, 0.72, 0, 1)`
  (~460 ms) while fading in — the panel arrives as a physical object, not a
  flat opacity fade.
- **Biometric glyph.** A Face ID–style bracket-corner + face mark (inline
  SVG) draws its corners in, then *breathes* (slow 2.6 s scale, ~0.38 Hz —
  deliberately outside the ~0.2 Hz vestibular-trigger range) with a soft glow.
  It appears on the entry screen and every ceremony hand-off screen so the
  wallet's UI reads as continuous with the incoming system prompt.
- **Activation scan.** On the confirm button press, a scan line sweeps the
  glyph and it does a quick confirm-pulse. Critically, `promptConfirm`
  resolves **synchronously** on that press (see §6) — the animation is CSS
  only and never delays `navigator.credentials.get()`.
- **Ring spinner** for pure network steps (publishing the key, account setup),
  kept distinct from the biometric glyph so the two states read differently.
- **Press feedback** on pointer-down: buttons scale to `0.97` and dim
  slightly, immediately (Response — kill latency).

Accessibility is baked in, not optional:

- `prefers-reduced-motion: reduce` → drops every transform/loop/spring, keeps
  short opacity cross-fades, and freezes the glyph in its drawn state.
- `prefers-reduced-transparency: reduce` → solid card, no blur.
- `prefers-contrast: more` → solid card with a contrasting border.

When editing: animate only `transform`/`opacity`, keep the click→ceremony path
free of `await`, and never add a looping animation near 0.2 Hz or a
full-viewport moving background.

## 9. Internationalization

All user-facing strings live in `src/i18n.ts`, translated into the five most
widely spoken languages by total speakers: English, Mandarin Chinese, Hindi,
Spanish, French. Language is auto-detected from `navigator.languages` (English
fallback) and overridable via `setLang`.

Rules for future edits:

- **No user-facing string literals** in `ui.ts` / `index.ts` / `errors.ts` —
  add a key to every catalog and use `t("key")`. The `i18n` test asserts every
  language defines the full English key set, so a half-added key fails CI.
- All five current languages are **left-to-right**. Adding a right-to-left
  language (e.g. Arabic) additionally requires setting `dir="rtl"` on the
  dialog container in `ui.ts`.
- Placeholders use `{name}` and are filled from `t(key, { name })`.
