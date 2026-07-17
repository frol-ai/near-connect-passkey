/**
 * Plain-language WebAuthn error mapping.
 *
 * Browsers surface `create()` / `get()` failures as `DOMException`s whose
 * `.name` is a terse code (`NotAllowedError`, `InvalidStateError`, …) and whose
 * `.message` is developer-facing jargon. A wallet's users are not developers —
 * they see these during Face ID / fingerprint / security-key prompts and need
 * to know what to DO, not what the spec calls the failure. This maps every
 * WebAuthn failure mode to a short, actionable, non-technical sentence.
 */

export type WebauthnCeremony = "create" | "get";

/** Best-effort extraction of a DOMException-style error name. */
function errorName(error: unknown): string {
  if (error && typeof error === "object" && "name" in error) {
    const name = (error as { name?: unknown }).name;
    if (typeof name === "string") return name;
  }
  return "";
}

/**
 * A human-readable, non-technical explanation for a WebAuthn ceremony failure.
 * `create` = making a new passkey, `get` = signing with an existing one.
 */
export function friendlyWebauthnError(error: unknown, ceremony: WebauthnCeremony): string {
  switch (errorName(error)) {
    case "NotAllowedError":
    case "AbortError":
      // The overwhelmingly common case: user dismissed the prompt or it
      // timed out. Never blame the user's hardware here.
      return ceremony === "create"
        ? "Passkey creation was cancelled or timed out. Please try again and confirm with your device when it asks."
        : "Sign-in was cancelled or timed out. Please try again and confirm with your device when it asks.";

    case "InvalidStateError":
      // excludeCredentials matched: a passkey for this wallet already exists
      // on this device. Route the user to "use existing" instead of creating.
      return "You already have an account on this device. Choose “Sign in” to use it.";

    case "NotSupportedError":
      return ceremony === "create"
        ? "This device can't create the kind of passkey this wallet needs. Try another device, or use your phone to scan the sign-in QR code."
        : "This device can't sign in with a passkey. Try the device where you first created it, or use your phone to scan the QR code.";

    case "ConstraintError":
      // Resident-key or user-verification requirement could not be met —
      // most often a security key with no PIN / no biometric set up.
      return ceremony === "create"
        ? "Your device or security key needs a PIN, fingerprint, or face unlock set up before it can create this passkey. Add one in your device settings and try again."
        : "Your security key needs a PIN or your device needs a screen lock to sign in. Set one up and try again.";

    case "SecurityError":
      return "This site isn't allowed to use passkeys right now. Make sure you're on the correct website and it's loaded over a secure (https) connection.";

    default:
      return ceremony === "create"
        ? "Something went wrong creating your passkey. Please try again, and make sure your device's screen lock (Face ID, fingerprint, or PIN) is set up."
        : "Something went wrong signing in with your passkey. Please try again on the device where you created it.";
  }
}
