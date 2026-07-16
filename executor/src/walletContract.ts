import { sha3_256 } from "@noble/hashes/sha3.js";
import { base58, base64 } from "@scure/base";

import { BorshWriter, compareBytes, concatBytes } from "./borsh";
import { AUTH_DOMAIN, CHAIN_ID, DEFAULT_TIMEOUT_SECS, REQUEST_DOMAIN } from "./constants";
import type { ConnectorAction } from "./types";

// ─── RFC-3339 <-> nanoseconds ────────────────────────────────────────────────

const RFC3339_RE =
  /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(\.\d{1,9})?([Zz]|[+-]\d{2}:\d{2})$/;

/** Parse an RFC-3339 timestamp into nanoseconds since the UNIX epoch. */
export function rfc3339ToNanos(value: string): bigint {
  const m = RFC3339_RE.exec(value);
  if (!m) throw new Error(`invalid RFC-3339 timestamp: ${value}`);
  const [, y, mo, d, h, mi, s, frac, offset] = m as unknown as string[] & { length: 9 };
  const utcMs = Date.UTC(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    Number(s),
  );
  let nanos = BigInt(utcMs) * 1_000_000n;
  if (frac) {
    nanos += BigInt(frac.slice(1).padEnd(9, "0"));
  }
  if (offset && offset.toUpperCase() !== "Z") {
    const sign = offset.startsWith("-") ? -1n : 1n;
    const [oh, om] = offset.slice(1).split(":");
    nanos -= sign * (BigInt(oh ?? "0") * 3600n + BigInt(om ?? "0") * 60n) * 1_000_000_000n;
  }
  return nanos;
}

/** Format nanoseconds since epoch as canonical RFC-3339 (`Z`, trailing zeros trimmed). */
export function nanosToRfc3339(nanos: bigint): string {
  const seconds = nanos / 1_000_000_000n;
  const frac = nanos % 1_000_000_000n;
  const base = new Date(Number(seconds) * 1000).toISOString().slice(0, 19);
  if (frac === 0n) return `${base}Z`;
  const fracStr = frac.toString().padStart(9, "0").replace(/0+$/, "");
  return `${base}.${fracStr}Z`;
}

// ─── JSON wire types (serde-compatible) ──────────────────────────────────────

export type CodeIdJson = { hash: string } | { account_id: string };

export type AuthSignerBindingJson =
  | { type: "signer_id"; signer_id: string }
  | {
      type: "code";
      code: CodeIdJson;
      signature_enabled: boolean;
      subwallet_id: number;
      timeout_secs: number;
      extensions: string[];
    };

export interface AuthMessageJson {
  chain_id: string;
  signer: AuthSignerBindingJson;
  purpose: string;
  recipient: string;
  payload: string;
  /** RFC-3339 */
  created_at: string;
  timeout_secs: number;
}

export type WalletOpJson =
  | { op: "set_signature_mode"; payload: { enable: boolean } }
  | { op: "add_extension"; payload: { account_id: string } }
  | { op: "remove_extension"; payload: { account_id: string } };

export interface StateInitJson {
  V1: {
    code: CodeIdJson;
    /** base64(key bytes) -> base64(value bytes) */
    data: Record<string, string>;
  };
}

export type NearActionJson =
  | {
      action: "function_call";
      payload: {
        function_name: string;
        /** base64 */
        args?: string;
        /** yoctoNEAR decimal string */
        deposit?: string;
        /** gas units, decimal string or number */
        gas?: string | number;
        /** decimal string or number, default 1 */
        gas_weight?: string | number;
      };
    }
  | { action: "transfer"; payload: { amount: string } }
  | {
      action: "deterministic_state_init";
      payload: { state_init: StateInitJson; deposit?: string };
    };

export interface NearPromiseJson {
  receiver_id: string;
  refund_to?: string;
  actions: NearActionJson[];
}

export interface RequestJson {
  internal?: WalletOpJson[];
  external?: NearPromiseJson[];
}

export interface RequestMessageJson {
  chain_id: string;
  signer_id: string;
  nonce: number;
  /** RFC-3339 */
  created_at: string;
  timeout_secs: number;
  request: RequestJson;
}

// ─── Borsh encoders (must match the Rust wallet-contract layout exactly) ────

function writeCodeId(w: BorshWriter, code: CodeIdJson): void {
  if ("hash" in code) {
    const bytes = base58.decode(code.hash);
    if (bytes.length !== 32) throw new Error("CodeId hash must be 32 bytes");
    w.writeU8(0).writeFixedBytes(bytes);
  } else {
    w.writeU8(1).writeString(code.account_id);
  }
}

function writeAuthSignerBinding(w: BorshWriter, signer: AuthSignerBindingJson): void {
  if (signer.type === "signer_id") {
    w.writeU8(0).writeString(signer.signer_id);
    return;
  }
  w.writeU8(1);
  writeCodeId(w, signer.code);
  w.writeBool(signer.signature_enabled);
  w.writeU32(signer.subwallet_id);
  w.writeU32(signer.timeout_secs);
  // BTreeSet<AccountId>: sorted Vec<String>
  w.writeVec([...signer.extensions].sort(), (ext) => w.writeString(ext));
}

export function serializeAuthMessage(msg: AuthMessageJson): Uint8Array {
  const w = new BorshWriter();
  w.writeString(msg.chain_id);
  writeAuthSignerBinding(w, msg.signer);
  w.writeString(msg.purpose);
  w.writeString(msg.recipient);
  w.writeString(msg.payload);
  w.writeU64(rfc3339ToNanos(msg.created_at));
  w.writeU32(msg.timeout_secs);
  return w.toBytes();
}

/** `SHA3-256("NEAR_WALLET_CONTRACT_AUTH/V1" || borsh(msg))` — the WebAuthn challenge. */
export function authMessageHash(msg: AuthMessageJson): Uint8Array {
  return sha3_256(
    concatBytes(new TextEncoder().encode(AUTH_DOMAIN), serializeAuthMessage(msg)),
  );
}

function writeWalletOp(w: BorshWriter, op: WalletOpJson): void {
  switch (op.op) {
    case "set_signature_mode":
      w.writeU8(0).writeBool(op.payload.enable);
      break;
    case "add_extension":
      w.writeU8(1).writeString(op.payload.account_id);
      break;
    case "remove_extension":
      w.writeU8(2).writeString(op.payload.account_id);
      break;
  }
}

export function serializeStateInitJson(stateInit: StateInitJson): Uint8Array {
  const w = new BorshWriter();
  w.writeU8(0); // StateInit::V1
  writeCodeId(w, stateInit.V1.code);
  const entries = Object.entries(stateInit.V1.data)
    .map(([k, v]) => [base64.decode(k), base64.decode(v)] as const)
    .sort((a, b) => compareBytes(a[0], b[0]));
  w.writeVec(entries, ([key, value]) => {
    w.writeBytes(key);
    w.writeBytes(value);
  });
  return w.toBytes();
}

function writeNearAction(w: BorshWriter, action: NearActionJson): void {
  switch (action.action) {
    case "function_call": {
      const p = action.payload;
      w.writeU8(2);
      w.writeString(p.function_name);
      w.writeBytes(p.args ? base64.decode(p.args) : new Uint8Array(0));
      w.writeU128(BigInt(p.deposit ?? "0"));
      w.writeU64(BigInt(p.gas ?? "0"));
      w.writeU64(BigInt(p.gas_weight ?? "1"));
      break;
    }
    case "transfer":
      w.writeU8(3).writeU128(BigInt(action.payload.amount));
      break;
    case "deterministic_state_init":
      w.writeU8(11);
      w.writeFixedBytes(serializeStateInitJson(action.payload.state_init));
      w.writeU128(BigInt(action.payload.deposit ?? "0"));
      break;
  }
}

function writeNearPromise(w: BorshWriter, promise: NearPromiseJson): void {
  w.writeString(promise.receiver_id);
  w.writeOption(promise.refund_to, (r) => w.writeString(r));
  w.writeVec(promise.actions, (a) => writeNearAction(w, a));
}

function writeRequest(w: BorshWriter, request: RequestJson): void {
  w.writeVec(request.internal ?? [], (op) => writeWalletOp(w, op));
  w.writeVec(request.external ?? [], (p) => writeNearPromise(w, p));
}

export function serializeRequestMessage(msg: RequestMessageJson): Uint8Array {
  const w = new BorshWriter();
  w.writeString(msg.chain_id);
  w.writeString(msg.signer_id);
  w.writeU32(msg.nonce);
  w.writeU64(rfc3339ToNanos(msg.created_at));
  w.writeU32(msg.timeout_secs);
  writeRequest(w, msg.request);
  return w.toBytes();
}

/** `SHA3-256("NEAR_WALLET_CONTRACT/V1" || borsh(msg))` — the WebAuthn challenge. */
export function requestMessageHash(msg: RequestMessageJson): Uint8Array {
  return sha3_256(
    concatBytes(new TextEncoder().encode(REQUEST_DOMAIN), serializeRequestMessage(msg)),
  );
}

// ─── Canonical JSON wire re-serialization ────────────────────────────────────

/**
 * Re-serialize an AuthMessage into the canonical serde wire form
 * (normalized RFC-3339 timestamp, sorted extensions).
 */
export function authMessageToWireJson(msg: AuthMessageJson): AuthMessageJson {
  const signer: AuthSignerBindingJson =
    msg.signer.type === "signer_id"
      ? { type: "signer_id", signer_id: msg.signer.signer_id }
      : {
          type: "code",
          code: msg.signer.code,
          signature_enabled: msg.signer.signature_enabled,
          subwallet_id: msg.signer.subwallet_id,
          timeout_secs: msg.signer.timeout_secs,
          extensions: [...msg.signer.extensions].sort(),
        };
  return {
    chain_id: msg.chain_id,
    signer,
    purpose: msg.purpose,
    recipient: msg.recipient,
    payload: msg.payload,
    created_at: nanosToRfc3339(rfc3339ToNanos(msg.created_at)),
    timeout_secs: msg.timeout_secs,
  };
}

// ─── Message building helpers ────────────────────────────────────────────────

/** `created_at` set slightly in the past so lagging block timestamps don't reject it. */
export function createdAtNow(): string {
  const seconds = Math.floor(Date.now() / 1000) - 60;
  return nanosToRfc3339(BigInt(seconds) * 1_000_000_000n);
}

export function buildRequestMessage(
  signerId: string,
  nonce: number,
  request: RequestJson,
): RequestMessageJson {
  return {
    chain_id: CHAIN_ID,
    signer_id: signerId,
    nonce,
    created_at: createdAtNow(),
    timeout_secs: DEFAULT_TIMEOUT_SECS,
    request,
  };
}

// ─── ConnectorAction -> wallet-contract promises ─────────────────────────────

export function connectorActionsToPromises(
  transactions: ReadonlyArray<{ receiverId: string; actions: ConnectorAction[] }>,
): NearPromiseJson[] {
  return transactions.map((tx) => ({
    receiver_id: tx.receiverId,
    actions: tx.actions.map(connectorActionToNearAction),
  }));
}

function connectorActionToNearAction(action: ConnectorAction): NearActionJson {
  switch (action.type) {
    case "FunctionCall": {
      const args = base64.encode(
        new TextEncoder().encode(JSON.stringify(action.params.args)),
      );
      const payload: Extract<NearActionJson, { action: "function_call" }>["payload"] = {
        function_name: action.params.methodName,
      };
      if (args.length > 0 && action.params.args != null) payload.args = args;
      if (action.params.deposit !== "0") payload.deposit = action.params.deposit;
      if (action.params.gas !== "0") payload.gas = action.params.gas;
      return { action: "function_call", payload };
    }
    case "Transfer":
      return { action: "transfer", payload: { amount: action.params.deposit } };
    default:
      throw new Error(
        `Action type "${action.type}" is not supported by the passkey wallet contract. ` +
          "Only FunctionCall and Transfer are supported.",
      );
  }
}
