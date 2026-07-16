import { CHAIN_ID, DEFAULT_TIMEOUT_SECS, FACTORY_ID } from "./constants";
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

/** NEP-641 AuthMessage with the passkey-style Code binding. */
export function buildAuthMessage(args: {
  purpose: string;
  recipient: string;
  payload: string;
  config: WalletConfig;
}): AuthMessageJson {
  return {
    chain_id: CHAIN_ID,
    signer: {
      type: "code",
      code: { account_id: FACTORY_ID },
      signature_enabled: args.config.signature_enabled,
      subwallet_id: args.config.subwallet_id,
      timeout_secs: args.config.timeout_secs,
      extensions: [...args.config.extensions].sort(),
    },
    purpose: args.purpose,
    recipient: args.recipient,
    payload: args.payload,
    created_at: createdAtNow(),
    timeout_secs: DEFAULT_TIMEOUT_SECS,
  };
}

/**
 * The `authorization` blob passed to `w_resolve_auth` — JSON-stringified
 * `SignedAuthMessage { message, proof }`.
 */
export function buildAuthorizationBlob(message: AuthMessageJson, proof: string): string {
  return JSON.stringify({ message: authMessageToWireJson(message), proof });
}
