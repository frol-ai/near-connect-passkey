import type { Client } from "near-api-ts";
import { keyPair } from "near-api-ts";
import { base58, base64 } from "@scure/base";

import { SPONSOR_ACCOUNT_ID, SPONSOR_PRIVATE_KEY } from "./constants";
import {
  assertOutcomeSuccess,
  delegateActionSignHash,
  sendRawTransaction,
  serializeDelegateAction,
  serializeDeterministicStateInitAction,
  serializeFunctionCallAction,
  serializeSignedDelegateAction,
  serializeSignedTransaction,
  serializeTransaction,
  transactionHash,
} from "./protocol";
import type { RequestMessageJson } from "./walletContract";
import type { FinalExecutionOutcome } from "./types";

const EXECUTE_GAS = 330_000_000_000_000n; // 330 TGas (300 TGas used to be the max possible value, but since nearcore 2.12 it was bumped to 1000 TGas, and wallet-contract usually consumes ~16 Tgas)
const EXECUTE_DEPOSIT = 1n; // 1 yoctoNEAR (w_execute_signed is #[payable])

function sponsorKeyPair() {
  if (!SPONSOR_ACCOUNT_ID || !SPONSOR_PRIVATE_KEY) {
    throw new Error(
      "Sponsor relayer is not configured (SPONSOR_ACCOUNT_ID / SPONSOR_PRIVATE_KEY are " +
        "empty in constants.ts). Fill in a dedicated LOW-VALUE relayer account before " +
        "shipping this executor.",
    );
  }
  return keyPair(SPONSOR_PRIVATE_KEY);
}

async function signAndSendSponsored(
  client: Client,
  rpcUrl: string,
  receiverId: string,
  rawActions: Uint8Array[],
): Promise<FinalExecutionOutcome> {
  const sponsor = sponsorKeyPair();
  const [blockHashB58, accessKey] = await Promise.all([
    client.getRecentBlockHash(),
    client.getAccountAccessKey({
      accountId: SPONSOR_ACCOUNT_ID,
      publicKey: sponsor.publicKey,
    }),
  ]);

  const txBytes = serializeTransaction({
    signerId: SPONSOR_ACCOUNT_ID,
    publicKey: sponsor.publicKeyU8,
    nonce: BigInt(accessKey.accountAccessKey.nonce) + 1n,
    receiverId,
    blockHash: base58.decode(blockHashB58),
    actions: rawActions,
  });

  const { signatureU8 } = await sponsor.signData({ dataU8: transactionHash(txBytes) });
  const outcome = await sendRawTransaction(
    rpcUrl,
    serializeSignedTransaction(txBytes, signatureU8),
  );
  assertOutcomeSuccess(outcome);
  return outcome;
}

/**
 * Relay `w_execute_signed(msg, proof)` to the user's wallet account,
 * optionally initializing the deterministic account (NEP-616 StateInit)
 * within the same transaction.
 */
export async function relayExecuteSigned(
  client: Client,
  rpcUrl: string,
  walletAccountId: string,
  msg: RequestMessageJson,
  proof: string,
  stateInitBorsh: Uint8Array | null,
): Promise<FinalExecutionOutcome> {
  const rawActions: Uint8Array[] = [];
  if (stateInitBorsh) {
    rawActions.push(serializeDeterministicStateInitAction(stateInitBorsh, 0n));
  }
  rawActions.push(
    serializeFunctionCallAction("w_execute_signed", { msg, proof }, EXECUTE_GAS, EXECUTE_DEPOSIT),
  );
  return signAndSendSponsored(client, rpcUrl, walletAccountId, rawActions);
}

// Delegate-action validity window (blocks past the signing block). Copied from
// near-connect-ledger's MAX_BLOCK_HEIGHT_INCREMENT (~15 minutes).
const MAX_BLOCK_HEIGHT_INCREMENT = 900n;

/**
 * Build a standard borsh `SignedDelegateAction` (NEP-461) whose sole action is
 * `w_execute_signed(msg, proof)` on the user's wallet account, returned as
 * base64 for a dApp relayer (e.g. Trezu's nt-be) to submit.
 *
 * Signed exactly like near-connect-ledger's `signDelegateActions`: build the
 * borsh `DelegateAction`, hash `sha256(NEP-366 prefix || bytes)`, ed25519-sign,
 * append `signature`. Passkey wallet accounts hold no NEAR access key, so the
 * *sponsor* account is the delegate `sender` and signer — the delegate is a
 * genuine, relayable meta-transaction (the user's WebAuthn authorization is the
 * `proof` carried inside `w_execute_signed`).
 *
 * The deterministic wallet account MUST already exist on-chain: the delegate
 * action carries no `DeterministicStateInit` (the relayer only accepts
 * `w_execute_signed` actions) and the sponsor cannot create it here.
 */
export async function buildSignedDelegateAction(
  client: Client,
  walletAccountId: string,
  msg: RequestMessageJson,
  proof: string,
): Promise<string> {
  const sponsor = sponsorKeyPair();
  const accessKey = await client.getAccountAccessKey({
    accountId: SPONSOR_ACCOUNT_ID,
    publicKey: sponsor.publicKey,
  });

  const action = serializeFunctionCallAction(
    "w_execute_signed",
    { msg, proof },
    EXECUTE_GAS,
    EXECUTE_DEPOSIT,
  );
  const delegateAction = serializeDelegateAction({
    senderId: SPONSOR_ACCOUNT_ID,
    receiverId: walletAccountId,
    actions: [action],
    nonce: BigInt(accessKey.accountAccessKey.nonce) + 1n,
    maxBlockHeight: BigInt(accessKey.blockHeight) + MAX_BLOCK_HEIGHT_INCREMENT,
    publicKey: sponsor.publicKeyU8,
  });

  const { signatureU8 } = await sponsor.signData({
    dataU8: delegateActionSignHash(delegateAction),
  });
  return base64.encode(serializeSignedDelegateAction(delegateAction, signatureU8));
}

/** Relay a StateInit-only transaction (account creation, no wallet call). */
export async function relayStateInit(
  client: Client,
  rpcUrl: string,
  walletAccountId: string,
  stateInitBorsh: Uint8Array,
): Promise<FinalExecutionOutcome> {
  return signAndSendSponsored(client, rpcUrl, walletAccountId, [
    serializeDeterministicStateInitAction(stateInitBorsh, 0n),
  ]);
}
