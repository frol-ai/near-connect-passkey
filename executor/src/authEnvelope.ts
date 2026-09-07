import { CHAIN_ID } from "./constants";
import type { OffchainMessageJson, WalletAuthorizationJson } from "./walletContract";
import { createdAtNow, offchainMessageToWireJson } from "./walletContract";

/**
 * NEP-641 `OffchainMessage` bound to the EXACT wallet account id.
 *
 * The wallet contract verifies `signer_id == current_account_id()`, so the
 * account id MUST be known before the passkey ceremony. The cold sign-in flow
 * therefore identifies the credential first (a discovery `get()` with a random
 * challenge) and only then signs the offchain message for the derived account.
 *
 * `timestamp` is set slightly in the past (see {@link createdAtNow}) so a
 * lagging block timestamp on the resolver side does not reject it.
 */
export function buildOffchainMessage(args: {
  signerId: string;
  payload: string;
  /** Path to the top-level resolver; empty for a top-level authorization. */
  path?: readonly string[];
}): OffchainMessageJson {
  const msg: OffchainMessageJson = {
    chain_id: CHAIN_ID,
    signer_id: args.signerId,
    timestamp: createdAtNow(),
    payload: args.payload,
  };
  if (args.path && args.path.length > 0) msg.path = [...args.path];
  return msg;
}

/**
 * The `authorization` blob passed to `w_resolve_auth(path, authorization)` —
 * JSON-stringified `WalletAuthorization::Signature { msg, proof }`.
 */
export function buildAuthorizationBlob(message: OffchainMessageJson, proof: string): string {
  const auth: WalletAuthorizationJson = {
    signature: { msg: offchainMessageToWireJson(message), proof },
  };
  return JSON.stringify(auth);
}
