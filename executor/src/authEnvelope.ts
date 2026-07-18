import { ALLOWED_FACTORY_IDS, CHAIN_ID, DEFAULT_TIMEOUT_SECS } from "./constants";
import type { AuthMessageJson } from "./walletContract";
import { authMessageToWireJson, createdAtNow } from "./walletContract";

/**
 * The config part of the wallet state bound into NEP-641 Code bindings.
 *
 * This is the INITIAL (NEP-616 StateInit) config the account was created
 * with — the contract validates the binding by re-deriving the
 * deterministic account id from it, so later on-chain config mutations
 * never invalidate the envelope. This executor always creates wallets
 * with {@link DEFAULT_WALLET_CONFIG}.
 */
export interface WalletConfig {
  signature_enabled: boolean;
  subwallet_id: number;
  timeout_secs: number;
  extensions: string[];
}

export const DEFAULT_WALLET_CONFIG: WalletConfig = {
  signature_enabled: true,
  subwallet_id: 0,
  timeout_secs: DEFAULT_TIMEOUT_SECS,
  extensions: [],
};

function baseAuthMessage(args: {
  purpose: string;
  recipient: string;
  payload: string;
}): Omit<AuthMessageJson, "signer"> {
  return {
    chain_id: CHAIN_ID,
    purpose: args.purpose,
    recipient: args.recipient,
    payload: args.payload,
    created_at: createdAtNow(),
    timeout_secs: DEFAULT_TIMEOUT_SECS,
  };
}

/**
 * NEP-641 AuthMessage bound to the EXACT account id (`SignerId` binding).
 *
 * Use this whenever the account id is already known (a returning sign-in, or
 * right after a new account is created) — it pins a single account and has no
 * sibling-account ambiguity. Prefer it over the `Code` binding.
 */
export function buildAuthMessageSignerId(args: {
  purpose: string;
  recipient: string;
  payload: string;
  signerId: string;
}): AuthMessageJson {
  return {
    ...baseAuthMessage(args),
    signer: { type: "signer_id", signer_id: args.signerId },
  };
}

/**
 * NEP-641 AuthMessage with the passkey-style `Code` binding.
 *
 * The envelope commits to the config plus the set of canonical factory ids it
 * may resolve under ({@link ALLOWED_FACTORY_IDS}); the contract reconstructs
 * the StateInit from the code it is currently running under, validates the
 * derived deterministic account id, AND checks its own factory is in the
 * allow-list. This keeps the envelope curve-independent — one ceremony even
 * before the credential's curve is known — while pinning the accepting set to
 * exactly one account per curve.
 *
 * Only for the cold "identify me by passkey" discovery flow, where the account
 * id is not yet known; use {@link buildAuthMessageSignerId} otherwise.
 */
export function buildAuthMessageCodeBinding(args: {
  purpose: string;
  recipient: string;
  payload: string;
  config: WalletConfig;
  allowedFactoryIds?: readonly string[];
}): AuthMessageJson {
  return {
    ...baseAuthMessage(args),
    signer: {
      type: "code",
      allowed_factory_ids: [...(args.allowedFactoryIds ?? ALLOWED_FACTORY_IDS)].sort(),
      signature_enabled: args.config.signature_enabled,
      subwallet_id: args.config.subwallet_id,
      timeout_secs: args.config.timeout_secs,
      extensions: [...args.config.extensions].sort(),
    },
  };
}

/**
 * The `authorization` blob passed to `w_resolve_auth` — JSON-stringified
 * `SignedAuthMessage { message, proof }`.
 */
export function buildAuthorizationBlob(message: AuthMessageJson, proof: string): string {
  return JSON.stringify({ message: authMessageToWireJson(message), proof });
}
