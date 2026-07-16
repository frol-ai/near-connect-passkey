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

export type SignInChoice = "existing" | "create";

/** Sign-in entry dialog: use an existing passkey or create a new one. */
export async function promptSignInChoice(): Promise<SignInChoice> {
  const el = await openDialog(`
    <h1>Passkey Wallet</h1>
    <p>Sign in with a passkey — no seed phrase, no extension</p>
    <button id="pk-existing">Use existing passkey</button>
    <button id="pk-create" style="${SECONDARY_BUTTON_STYLE}">Create new passkey</button>
  `);
  return new Promise<SignInChoice>((resolve, reject) => {
    el.querySelector("#pk-existing")?.addEventListener("click", async () => {
      await closeDialog();
      resolve("existing");
    });
    el.querySelector("#pk-create")?.addEventListener("click", async () => {
      await closeDialog();
      resolve("create");
    });
    // no cancel affordance beyond host-side iframe close; keep reject unused
    void reject;
  });
}

/** Name input shown before creating a new passkey. */
export async function promptPasskeyName(): Promise<string> {
  const el = await openDialog(`
    <h1>Name your passkey</h1>
    <p>Shown in your device's passkey manager</p>
    <input id="pk-name" style="${INPUT_STYLE}" placeholder="NEAR Passkey" maxlength="64" />
    <button id="pk-continue">Create passkey</button>
  `);
  return new Promise<string>((resolve) => {
    const submit = async () => {
      const input = el.querySelector<HTMLInputElement>("#pk-name");
      const name = input?.value.trim() || "NEAR Passkey";
      await closeDialog();
      resolve(name);
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
    el.querySelector("#pk-retry")?.addEventListener("click", async () => {
      await closeDialog();
      resolve(true);
    });
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
