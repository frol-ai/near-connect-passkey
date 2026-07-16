import { sha256 } from "@noble/hashes/sha2.js";
import { base64 } from "@scure/base";

import { BorshWriter } from "./borsh";

/**
 * Minimal raw NEAR protocol transaction encoder.
 *
 * near-api-ts@0.10.0 has no `DeterministicStateInit` action (NEP-616,
 * protocol Action enum variant 11), so transactions that carry a StateInit
 * are borsh-encoded here by hand and broadcast over plain JSON-RPC.
 * Upstream-contribution candidate — see README.
 *
 * Protocol `Action` enum (nearcore near-primitives):
 * CreateAccount=0, DeployContract=1, FunctionCall=2, Transfer=3, Stake=4,
 * AddKey=5, DeleteKey=6, DeleteAccount=7, Delegate=8,
 * DeployGlobalContract=9, UseGlobalContract=10, DeterministicStateInit=11.
 */

/** Action::FunctionCall { method_name, args, gas: u64, deposit: u128 }. */
export function serializeFunctionCallAction(
  methodName: string,
  argsJson: unknown,
  gas: bigint,
  deposit: bigint,
): Uint8Array {
  const w = new BorshWriter();
  w.writeU8(2);
  w.writeString(methodName);
  w.writeBytes(new TextEncoder().encode(JSON.stringify(argsJson)));
  w.writeU64(gas);
  w.writeU128(deposit);
  return w.toBytes();
}

/** Action::DeterministicStateInit { state_init: StateInit, deposit: u128 }. */
export function serializeDeterministicStateInitAction(
  stateInitBorsh: Uint8Array,
  deposit: bigint,
): Uint8Array {
  const w = new BorshWriter();
  w.writeU8(11);
  w.writeFixedBytes(stateInitBorsh);
  w.writeU128(deposit);
  return w.toBytes();
}

/**
 * Transaction { signer_id, public_key (ed25519), nonce: u64, receiver_id,
 * block_hash: [u8; 32], actions: Vec<Action> }.
 */
export function serializeTransaction(args: {
  signerId: string;
  /** raw 32-byte ed25519 public key */
  publicKey: Uint8Array;
  nonce: bigint;
  receiverId: string;
  blockHash: Uint8Array;
  /** pre-serialized actions */
  actions: Uint8Array[];
}): Uint8Array {
  const w = new BorshWriter();
  w.writeString(args.signerId);
  w.writeU8(0); // PublicKey::ED25519
  w.writeFixedBytes(args.publicKey);
  w.writeU64(args.nonce);
  w.writeString(args.receiverId);
  w.writeFixedBytes(args.blockHash);
  w.writeU32(args.actions.length);
  for (const action of args.actions) w.writeFixedBytes(action);
  return w.toBytes();
}

/** SignedTransaction { transaction, signature (ed25519) }. */
export function serializeSignedTransaction(
  transactionBytes: Uint8Array,
  signature: Uint8Array,
): Uint8Array {
  const w = new BorshWriter();
  w.writeFixedBytes(transactionBytes);
  w.writeU8(0); // Signature::ED25519
  w.writeFixedBytes(signature);
  return w.toBytes();
}

/** NEAR signs `sha256(borsh(Transaction))`. */
export function transactionHash(transactionBytes: Uint8Array): Uint8Array {
  return sha256(transactionBytes);
}

interface JsonRpcResponse {
  result?: unknown;
  error?: { message?: string; data?: unknown; cause?: unknown };
}

async function jsonRpc(rpcUrl: string, method: string, params: unknown): Promise<unknown> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "passkey-executor", method, params }),
  });
  if (!response.ok) {
    throw new Error(`RPC ${method} failed: HTTP ${response.status}`);
  }
  const body = (await response.json()) as JsonRpcResponse;
  if (body.error) {
    throw new Error(`RPC ${method} failed: ${JSON.stringify(body.error)}`);
  }
  return body.result;
}

/**
 * Broadcast a signed transaction and wait for execution. Returns the raw
 * final execution outcome from the node.
 */
export async function sendRawTransaction(
  rpcUrl: string,
  signedTransactionBytes: Uint8Array,
): Promise<unknown> {
  const signedTxBase64 = base64.encode(signedTransactionBytes);
  try {
    return await jsonRpc(rpcUrl, "send_tx", {
      signed_tx_base64: signedTxBase64,
      wait_until: "EXECUTED_OPTIMISTIC",
    });
  } catch (e) {
    // Older nodes may not expose `send_tx` — fall back to the legacy method.
    if (e instanceof Error && /METHOD_NOT_FOUND|Method not found/i.test(e.message)) {
      return await jsonRpc(rpcUrl, "broadcast_tx_commit", [signedTxBase64]);
    }
    throw e;
  }
}

/** Throws when the outcome status carries a failure. */
export function assertOutcomeSuccess(outcome: unknown): void {
  const status = (outcome as { status?: unknown } | null)?.status;
  if (status && typeof status === "object" && "Failure" in status) {
    throw new Error(`transaction failed: ${JSON.stringify(status)}`);
  }
}
