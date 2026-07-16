import type { Client } from "near-api-ts";

import { CHAIN_ID, DEFAULT_TIMEOUT_SECS, FACTORY_ID } from "./constants";
import type { AuthMessageJson } from "./walletContract";
import { authMessageToWireJson, createdAtNow } from "./walletContract";

/** The config part of the wallet state bound into NEP-641 Code bindings. */
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

export function configsEqual(a: WalletConfig, b: WalletConfig): boolean {
  return (
    a.signature_enabled === b.signature_enabled &&
    a.subwallet_id === b.subwallet_id &&
    a.timeout_secs === b.timeout_secs &&
    a.extensions.length === b.extensions.length &&
    [...a.extensions].sort().every((ext, i) => ext === [...b.extensions].sort()[i])
  );
}

/** Query the LIVE wallet config via view calls. */
export async function fetchLiveConfig(
  client: Client,
  accountId: string,
): Promise<WalletConfig> {
  const view = async (functionName: string): Promise<unknown> =>
    (await client.callContractReadFunction({ contractAccountId: accountId, functionName }))
      .result;

  // NOTE: `w_is_signature_allowed` is the closest available view to the raw
  // `State::signature_enabled` flag (they only diverge in the degenerate
  // `!signature_enabled && extensions.is_empty()` deployment, which this
  // executor never produces).
  const [signatureAllowed, subwalletId, timeoutSecs, extensions] = await Promise.all([
    view("w_is_signature_allowed"),
    view("w_subwallet_id"),
    view("w_timeout_secs"),
    view("w_extensions"),
  ]);

  return {
    signature_enabled: Boolean(signatureAllowed),
    subwallet_id: Number(subwalletId),
    timeout_secs: Number(timeoutSecs),
    extensions: Array.isArray(extensions)
      ? extensions.filter((e): e is string => typeof e === "string")
      : [],
  };
}

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
