import { DEFAULT_PASSKEY_LABEL } from "./constants";
import { t } from "./i18n";
import { selector } from "./types";

/**
 * Dialogs rendered into the sandbox iframe's `#root` element (the host shows
 * the iframe as a modal overlay). Everything here is self-contained — a single
 * injected stylesheet plus inline SVG — so the wallet looks the same on every
 * host and every platform.
 *
 * Motion goal: the overlay should feel like a native hand-off to Face ID /
 * Touch ID / Windows Hello / Android screen lock — a translucent panel that
 * *materializes* with a spring-eased scale, a biometric glyph that breathes
 * while the system takes over, and buttons that respond on press. All of it
 * degrades to plain cross-fades under `prefers-reduced-motion`, and to solid
 * surfaces under `prefers-reduced-transparency` / `prefers-contrast`.
 */

// ─── Design system (injected once) ───────────────────────────────────────────

const STYLE_ID = "pk-styles";

/** iOS-style spring ease: fast out, gentle settle (Designing Fluid Interfaces). */
const SPRING = "cubic-bezier(0.32, 0.72, 0, 1)";

const STYLES = `
:root{
  --pk-accent:#0A84FF;
  --pk-accent-hi:#409CFF;
  --pk-surface:rgba(30,30,32,0.72);
  --pk-surface-solid:#1c1c1e;
  --pk-text:#f5f5f7;
  --pk-subtle:rgba(235,235,245,0.6);
  --pk-hairline:rgba(255,255,255,0.10);
  --pk-secondary:rgba(120,120,128,0.28);
  --pk-error:#ff8a80;
  --pk-shadow:0 24px 70px rgba(0,0,0,0.55);
}
@media (prefers-color-scheme: light){
  :root{
    --pk-accent:#007AFF;
    --pk-accent-hi:#3395ff;
    --pk-surface:rgba(255,255,255,0.72);
    --pk-surface-solid:#ffffff;
    --pk-text:#1d1d1f;
    --pk-subtle:rgba(60,60,67,0.6);
    --pk-hairline:rgba(0,0,0,0.06);
    --pk-secondary:rgba(120,120,128,0.18);
    --pk-error:#d70015;
    --pk-shadow:0 24px 70px rgba(0,0,0,0.22);
  }
}
#root{display:flex;align-items:center;justify-content:center;min-height:100%;box-sizing:border-box;padding:16px;}
.pk-backdrop{
  display:flex;align-items:center;justify-content:center;width:100%;
  animation:pk-fade 240ms ease both;
}
.pk-card{
  box-sizing:border-box;width:min(90vw,340px);
  padding:28px 24px 22px;border-radius:26px;
  background:var(--pk-surface);
  -webkit-backdrop-filter:blur(30px) saturate(180%);
  backdrop-filter:blur(30px) saturate(180%);
  border:1px solid var(--pk-hairline);
  box-shadow:var(--pk-shadow), inset 0 1px 0 rgba(255,255,255,0.08);
  color:var(--pk-text);
  font:400 15px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,Roboto,sans-serif;
  text-align:center;
  transform-origin:center bottom;
  animation:pk-materialize 460ms ${SPRING} both;
  will-change:transform,opacity;
}
.pk-card h1{
  margin:14px 0 6px;font-size:22px;line-height:1.15;font-weight:600;
  letter-spacing:-0.02em;color:var(--pk-text);
}
.pk-card p{margin:0 0 4px;font-size:15px;color:var(--pk-subtle);}
.pk-card p.pk-error{color:var(--pk-error);margin-top:8px;}
.pk-btn{
  -webkit-appearance:none;appearance:none;cursor:pointer;
  display:block;width:100%;margin-top:12px;padding:0 16px;height:52px;
  border:0;border-radius:14px;font-size:17px;font-weight:600;
  font-family:inherit;letter-spacing:-0.01em;
  color:#fff;background:linear-gradient(180deg,var(--pk-accent-hi),var(--pk-accent));
  box-shadow:0 1px 0 rgba(255,255,255,0.18) inset;
  transition:transform 120ms ${SPRING}, filter 120ms ease, opacity 120ms ease;
  touch-action:manipulation;
}
.pk-btn:hover{filter:brightness(1.05);}
.pk-btn:active{transform:scale(0.97);filter:brightness(0.96);}
.pk-btn.pk-secondary{
  color:var(--pk-text);background:var(--pk-secondary);box-shadow:none;
}
.pk-input{
  box-sizing:border-box;display:block;width:100%;margin-top:16px;
  padding:14px 16px;border-radius:14px;border:1px solid var(--pk-hairline);
  background:rgba(120,120,128,0.16);color:var(--pk-text);
  font-size:16px;font-family:inherit;text-align:center;outline:none;
  transition:border-color 160ms ease, box-shadow 160ms ease;
}
.pk-input::placeholder{color:var(--pk-subtle);}
.pk-input:focus{
  border-color:var(--pk-accent);
  box-shadow:0 0 0 4px color-mix(in srgb, var(--pk-accent) 22%, transparent);
}

/* ── biometric glyph (Face ID–style) ── */
.pk-bio{position:relative;width:96px;height:96px;margin:6px auto 14px;color:var(--pk-accent);}
.pk-bio::before{
  content:"";position:absolute;inset:8px;border-radius:24px;
  background:radial-gradient(closest-side, color-mix(in srgb, var(--pk-accent) 45%, transparent), transparent 72%);
  filter:blur(6px);opacity:0.5;animation:pk-glow 2.6s ease-in-out infinite;
}
.pk-face{position:relative;display:block;width:96px;height:96px;
  animation:pk-breathe 2.6s ease-in-out infinite;}
.pk-face path,.pk-face line{
  stroke:currentColor;stroke-width:6;stroke-linecap:round;stroke-linejoin:round;fill:none;
}
.pk-face .pk-corners path{
  stroke-dasharray:64;stroke-dashoffset:64;
  animation:pk-draw 640ms ${SPRING} forwards;
}
.pk-face .pk-features{opacity:0;animation:pk-feat 400ms ease 420ms forwards;}
.pk-face .pk-scan{
  stroke:var(--pk-accent-hi);opacity:0;
  filter:drop-shadow(0 0 6px var(--pk-accent));
}
.pk-activating .pk-face{animation:pk-confirm 620ms ${SPRING} both;}
.pk-activating .pk-face .pk-scan{animation:pk-sweep 640ms ease both;}

/* ── ring spinner (network steps) ── */
.pk-spin{
  width:34px;height:34px;margin:8px auto 10px;border-radius:50%;
  background:conic-gradient(from 0deg, transparent 0 20%, var(--pk-accent) 92%);
  -webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 4px),#000 calc(100% - 3.5px));
  mask:radial-gradient(farthest-side,transparent calc(100% - 4px),#000 calc(100% - 3.5px));
  animation:pk-rot 0.9s linear infinite;
}

@keyframes pk-fade{from{opacity:0}to{opacity:1}}
@keyframes pk-materialize{
  0%{opacity:0;transform:translateY(14px) scale(0.94)}
  70%{opacity:1;transform:translateY(0) scale(1.006)}
  100%{opacity:1;transform:translateY(0) scale(1)}
}
@keyframes pk-rot{to{transform:rotate(360deg)}}
@keyframes pk-draw{to{stroke-dashoffset:0}}
@keyframes pk-feat{to{opacity:1}}
@keyframes pk-breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.045)}}
@keyframes pk-glow{0%,100%{opacity:0.35;transform:scale(0.96)}50%{opacity:0.7;transform:scale(1.05)}}
@keyframes pk-sweep{
  0%{opacity:0;transform:translateY(-30px)}
  15%{opacity:1}
  85%{opacity:1}
  100%{opacity:0;transform:translateY(30px)}
}
@keyframes pk-confirm{
  0%{transform:scale(1)}40%{transform:scale(0.92)}100%{transform:scale(1)}
}

@media (prefers-reduced-motion: reduce){
  .pk-backdrop{animation:pk-fade 160ms ease both;}
  .pk-card{animation:pk-fade 160ms ease both;}
  .pk-face,.pk-bio::before,.pk-face .pk-corners path,.pk-face .pk-features{animation:none;}
  .pk-face .pk-corners path{stroke-dashoffset:0;}
  .pk-face .pk-features{opacity:1;}
  .pk-activating .pk-face,.pk-activating .pk-face .pk-scan{animation:none;}
  .pk-btn:active{transform:none;}
}
@media (prefers-reduced-transparency: reduce){
  .pk-card{background:var(--pk-surface-solid);-webkit-backdrop-filter:none;backdrop-filter:none;}
}
@media (prefers-contrast: more){
  .pk-card{background:var(--pk-surface-solid);border-color:var(--pk-text);}
  .pk-btn.pk-secondary{border:1px solid var(--pk-text);}
}
`;

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = STYLES;
  document.head.appendChild(style);
}

/** Face ID–style biometric mark: bracket corners + a simple face + scan line. */
const BIOMETRIC_SVG = `
<div class="pk-bio"><svg class="pk-face" viewBox="0 0 100 100" aria-hidden="true">
  <g class="pk-corners">
    <path d="M14 32 V20 Q14 14 20 14 H32"/>
    <path d="M68 14 H80 Q86 14 86 20 V32"/>
    <path d="M86 68 V80 Q86 86 80 86 H68"/>
    <path d="M32 86 H20 Q14 86 14 80 V68"/>
  </g>
  <g class="pk-features">
    <line x1="37" y1="40" x2="37" y2="49"/>
    <line x1="63" y1="40" x2="63" y2="49"/>
    <path d="M50 40 V53 Q50 57 45 57"/>
    <path d="M37 65 Q50 74 63 65"/>
  </g>
  <line class="pk-scan" x1="18" y1="50" x2="82" y2="50"/>
</svg></div>`;

const SPINNER_SVG = `<div class="pk-spin" aria-hidden="true"></div>`;

// ─── Screen shell ─────────────────────────────────────────────────────────────

function root(): HTMLElement {
  const el = document.getElementById("root");
  if (!el) throw new Error("sandbox #root element missing");
  return el;
}

/** Replace the current screen; every screen re-plays the materialize entrance. */
async function openDialog(inner: string): Promise<HTMLElement> {
  ensureStyles();
  const el = root();
  el.innerHTML = `<div class="pk-backdrop"><div class="pk-card">${inner}</div></div>`;
  el.style.display = "flex";
  await selector().ui.showIframe();
  return el;
}

async function closeDialog(): Promise<void> {
  const el = root();
  el.innerHTML = "";
  el.style.display = "none";
  await selector().ui.hideIframe();
}

/** Close whatever screen is currently shown. Safe to call repeatedly. */
export async function closeUi(): Promise<void> {
  await closeDialog();
}

export type ProgressVisual = "spinner" | "biometric";

/**
 * Long-running-step screen. `biometric` (the default for ceremony hand-offs)
 * shows the breathing Face ID glyph so the wallet's screen feels continuous
 * with the system passkey prompt; `spinner` is for pure network steps
 * (publishing keys, account setup).
 */
export async function showProgress(
  title: string,
  subtitle: string,
  visual: ProgressVisual = "spinner",
): Promise<void> {
  const art = visual === "biometric" ? BIOMETRIC_SVG : SPINNER_SVG;
  await openDialog(`
    ${art}
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(subtitle)}</p>
  `);
}

export type SignInChoice = "existing" | "create";

/**
 * Entry dialog, in Web2-familiar terms: "Sign up" creates a new account,
 * "Sign in" uses an existing passkey. (`create` / `existing` internally.)
 */
export async function promptSignInChoice(): Promise<SignInChoice> {
  const el = await openDialog(`
    ${BIOMETRIC_SVG}
    <h1>${escapeHtml(t("appTitle"))}</h1>
    <p>${escapeHtml(t("appTagline"))}</p>
    <button id="pk-create" class="pk-btn">${escapeHtml(t("signUp"))}</button>
    <button id="pk-existing" class="pk-btn pk-secondary">${escapeHtml(t("signIn"))}</button>
  `);
  return new Promise<SignInChoice>((resolve, reject) => {
    el.querySelector("#pk-existing")?.addEventListener("click", () => resolve("existing"));
    el.querySelector("#pk-create")?.addEventListener("click", () => resolve("create"));
    // no cancel affordance beyond host-side iframe close; keep reject unused
    void reject;
  });
}

/**
 * A single-button confirmation shown immediately before a WebAuthn ceremony
 * that the dApp (not a user tap) initiated — signing a transaction/message,
 * or confirming a returning sign-in. The button click supplies the transient
 * user activation Safari/iOS require for `navigator.credentials.get()`, and
 * the ceremony is invoked directly from the click with no network in between.
 *
 * On press we start the "activating" scan animation and resolve SYNCHRONOUSLY
 * (no await) so the ceremony fires within the activation window while the
 * glyph animates behind the incoming system prompt.
 */
export async function promptConfirm(
  title: string,
  subtitle: string,
  buttonLabel: string,
): Promise<void> {
  const el = await openDialog(`
    ${BIOMETRIC_SVG}
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(subtitle)}</p>
    <button id="pk-confirm" class="pk-btn">${escapeHtml(buttonLabel)}</button>
  `);
  return new Promise<void>((resolve) => {
    el.querySelector("#pk-confirm")?.addEventListener("click", () => {
      el.querySelector(".pk-card")?.classList.add("pk-activating");
      resolve();
    });
  });
}

/**
 * Label input shown only when creating an ADDITIONAL account (the user
 * already has a passkey here). A username or email keeps the accounts apart
 * in the device's passkey manager. Empty falls back to the default label.
 */
export async function promptPasskeyLabel(): Promise<string> {
  const el = await openDialog(`
    <h1>${escapeHtml(t("addAccountTitle"))}</h1>
    <p>${escapeHtml(t("addAccountSubtitle"))}</p>
    <input id="pk-name" class="pk-input" placeholder="${escapeHtml(t("usernameOrEmailPlaceholder"))}" maxlength="64" autocomplete="off" />
    <button id="pk-continue" class="pk-btn">${escapeHtml(t("continue"))}</button>
  `);
  return new Promise<string>((resolve) => {
    const submit = () => {
      const input = el.querySelector<HTMLInputElement>("#pk-name");
      resolve(input?.value.trim() || DEFAULT_PASSKEY_LABEL);
    };
    el.querySelector("#pk-continue")?.addEventListener("click", submit);
    el.querySelector<HTMLInputElement>("#pk-name")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") void submit();
    });
    el.querySelector<HTMLInputElement>("#pk-name")?.focus();
  });
}

/** Registration-failure dialog. Resolves true for Retry, false for Cancel. */
export async function promptRetryRegistration(message: string): Promise<boolean> {
  const el = await openDialog(`
    <h1>${escapeHtml(t("registrationFailedTitle"))}</h1>
    <p>${escapeHtml(message)}</p>
    <p class="pk-error">${escapeHtml(t("registrationNotRegisteredWarning"))}</p>
    <button id="pk-retry" class="pk-btn">${escapeHtml(t("retry"))}</button>
    <button id="pk-cancel" class="pk-btn pk-secondary">${escapeHtml(t("cancel"))}</button>
  `);
  return new Promise<boolean>((resolve) => {
    el.querySelector("#pk-retry")?.addEventListener("click", () => resolve(true));
    el.querySelector("#pk-cancel")?.addEventListener("click", async () => {
      await closeDialog();
      resolve(false);
    });
  });
}

/** Terminal error dialog (e.g. "passkey not registered"). */
export async function showErrorDialog(title: string, message: string): Promise<void> {
  const el = await openDialog(`
    <h1>${escapeHtml(title)}</h1>
    <p class="pk-error">${escapeHtml(message)}</p>
    <button id="pk-close" class="pk-btn pk-secondary">${escapeHtml(t("close"))}</button>
  `);
  return new Promise<void>((resolve) => {
    el.querySelector("#pk-close")?.addEventListener("click", async () => {
      await closeDialog();
      resolve();
    });
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
