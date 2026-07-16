import { keccak_256 } from "@noble/hashes/sha3.js";
import { base58, base64, hex } from "@scure/base";

import { BorshWriter, compareBytes } from "./borsh";
import { DEFAULT_TIMEOUT_SECS, FACTORY_IDS } from "./constants";
import type { PasskeyCurve } from "./types";
import type { CodeIdJson, StateInitJson } from "./walletContract";

export interface PasskeyPublicKey {
  curve: PasskeyCurve;
  /** P-256: 33-byte SEC-1 compressed. Ed25519: 32-byte raw. */
  bytes: Uint8Array;
}

/** "p256:<base58>" / "ed25519:<base58>" — the wallet-contract key convention. */
export function publicKeyToString(key: PasskeyPublicKey): string {
  return `${key.curve}:${base58.encode(key.bytes)}`;
}

export function publicKeyFromString(value: string): PasskeyPublicKey {
  if (value.startsWith("p256:")) {
    const bytes = base58.decode(value.slice(5));
    if (bytes.length !== 33 || !(bytes[0] === 0x02 || bytes[0] === 0x03)) {
      throw new Error("invalid p256 public key");
    }
    return { curve: "p256", bytes };
  }
  if (value.startsWith("ed25519:")) {
    const bytes = base58.decode(value.slice(8));
    if (bytes.length !== 32) throw new Error("invalid ed25519 public key");
    return { curve: "ed25519", bytes };
  }
  throw new Error(`unsupported public key: ${value}`);
}

/**
 * borsh(State) with default config:
 * signature_enabled=true, subwallet_id=0, timeout=3600s,
 * last_cleaned_at=0, empty nonce bitmaps, no extensions.
 *
 * State layout (contracts/wallet/src/state.rs + nonces.rs):
 * bool || u32 || PubKey (raw fixed bytes) || Nonces{u32, u64, map, map} || Vec<String>
 */
export function serializeDefaultWalletState(publicKey: PasskeyPublicKey): Uint8Array {
  const w = new BorshWriter();
  w.writeBool(true); // signature_enabled
  w.writeU32(0); // subwallet_id
  w.writeFixedBytes(publicKey.bytes); // public_key ([u8; 33] p256 / [u8; 32] ed25519)
  w.writeU32(DEFAULT_TIMEOUT_SECS); // nonces.timeout (secs)
  w.writeU64(0n); // nonces.last_cleaned_at (nanos)
  w.writeU32(0); // nonces.old: BTreeMap<u32,u32> count
  w.writeU32(0); // nonces.current: BTreeMap<u32,u32> count
  w.writeU32(0); // extensions: BTreeSet<AccountId> count
  return w.toBytes();
}

/**
 * borsh(StateInit) for arbitrary code + data entries.
 * StateInit::V1 { code: GlobalContractId, data: BTreeMap<Vec<u8>, Vec<u8>> }
 */
export function serializeStateInit(
  code: CodeIdJson,
  data: ReadonlyArray<readonly [Uint8Array, Uint8Array]>,
): Uint8Array {
  const w = new BorshWriter();
  w.writeU8(0); // StateInit::V1
  if ("hash" in code) {
    const bytes = base58.decode(code.hash);
    if (bytes.length !== 32) throw new Error("CodeId hash must be 32 bytes");
    w.writeU8(0).writeFixedBytes(bytes);
  } else {
    w.writeU8(1).writeString(code.account_id);
  }
  const sorted = [...data].sort((a, b) => compareBytes(a[0], b[0]));
  w.writeVec(sorted, ([key, value]) => {
    w.writeBytes(key);
    w.writeBytes(value);
  });
  return w.toBytes();
}

/** borsh(StateInit) for the default passkey wallet of `publicKey`. */
export function serializeDefaultStateInit(publicKey: PasskeyPublicKey): Uint8Array {
  // STATE_KEY is the empty byte string.
  return serializeStateInit({ account_id: FACTORY_IDS[publicKey.curve] }, [
    [new Uint8Array(0), serializeDefaultWalletState(publicKey)],
  ]);
}

/** JSON wire form of the default StateInit (for wallet-contract promises). */
export function defaultStateInitJson(publicKey: PasskeyPublicKey): StateInitJson {
  return {
    V1: {
      code: { account_id: FACTORY_IDS[publicKey.curve] },
      data: { [base64.encode(new Uint8Array(0))]: base64.encode(serializeDefaultWalletState(publicKey)) },
    },
  };
}

/** NEP-616: `"0s" + hex(keccak256(borsh(StateInit))[12..32])`. */
export function deriveAccountIdFromStateInit(stateInitBorsh: Uint8Array): string {
  const hash = keccak_256(stateInitBorsh);
  return `0s${hex.encode(hash.slice(12, 32))}`;
}

/** Deterministic account id of the default passkey wallet of `publicKey`. */
export function deriveAccountId(publicKey: PasskeyPublicKey): string {
  return deriveAccountIdFromStateInit(serializeDefaultStateInit(publicKey));
}
