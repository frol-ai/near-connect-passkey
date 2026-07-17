import { DEFAULT_PASSKEY_LABEL } from "./constants";
import { selector } from "./types";

/**
 * Minimal dialogs rendered into the sandbox iframe's `#root` element
 * (the host page styles `.prompt-container` — see SandboxedWallet/code.ts).
 */

const SECONDARY_BUTTON_STYLE = "background-color:#1a1a1a;margin-top:8px;";
const INPUT_STYLE =
  "margin-top:16px;padding:12px;border-radius:12px;border:1px solid #444;" +
  "background:#131313;color:#fff;font-size:14px;width:240px;outline:none;text-align:center;";
const ERROR_STYLE = "color:#ff8a80;font-size:14px;margin-top:8px;";
const SPINNER_HTML =
  '<div style="margin:20px auto 4px;width:28px;height:28px;border:3px solid #333;' +
  'border-top-color:#fff;border-radius:50%;animation:pk-spin 0.8s linear infinite;"></div>' +
  "<style>@keyframes pk-spin{to{transform:rotate(360deg)}}</style>";

function root(): HTMLElement {
  const el = document.getElementById("root");
  if (!el) throw new Error("sandbox #root element missing");
  return el;
}

async function openDialog(html: string): Promise<HTMLElement> {
  const el = root();
  el.innerHTML = `<div class="prompt-container">${html}</div>`;
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

/**
 * Spinner screen for long-running steps (WebAuthn ceremony, registry
 * round-trips, account setup). Replaces the current screen and stays up
 * until the next screen or [`closeUi()`] — the user is never left staring
 * at nothing while the flow progresses.
 */
export async function showProgress(title: string, subtitle: string): Promise<void> {
  await openDialog(`
    <h1>${escapeHtml(title)}</h1>
    ${SPINNER_HTML}
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
    <h1>Trezu</h1>
    <p>No password, no seed phrase — just your device.</p>
    <button id="pk-create">Sign up</button>
    <button id="pk-existing" style="${SECONDARY_BUTTON_STYLE}">Sign in</button>
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
 */
export async function promptConfirm(
  title: string,
  subtitle: string,
  buttonLabel: string,
): Promise<void> {
  const el = await openDialog(`
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(subtitle)}</p>
    <button id="pk-confirm">${escapeHtml(buttonLabel)}</button>
  `);
  return new Promise<void>((resolve) => {
    el.querySelector("#pk-confirm")?.addEventListener("click", () => resolve());
  });
}

/**
 * Label input shown only when creating an ADDITIONAL account (the user
 * already has a passkey here). A username or email keeps the accounts apart
 * in the device's passkey manager. Empty falls back to the default label.
 */
export async function promptPasskeyLabel(): Promise<string> {
  const el = await openDialog(`
    <h1>Add another account</h1>
    <p>Enter a username or email to tell your accounts apart</p>
    <input id="pk-name" style="${INPUT_STYLE}" placeholder="username or email" maxlength="64" autocomplete="off" />
    <button id="pk-continue">Continue</button>
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
    <h1>Registration failed</h1>
    <p>${escapeHtml(message)}</p>
    <p style="${ERROR_STYLE}">Your passkey was created but is not registered yet. Without registration it cannot be recovered on other devices.</p>
    <button id="pk-retry">Retry</button>
    <button id="pk-cancel" style="${SECONDARY_BUTTON_STYLE}">Cancel</button>
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
    <p style="${ERROR_STYLE}">${escapeHtml(message)}</p>
    <button id="pk-close">Close</button>
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
