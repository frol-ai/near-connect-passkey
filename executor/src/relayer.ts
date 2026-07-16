import type { Client } from "near-api-ts";
import { keyPair } from "near-api-ts";
import { base58 } from "@scure/base";

import { SPONSOR_ACCOUNT_ID, SPONSOR_PRIVATE_KEY } from "./constants";
import {
  assertOutcomeSuccess,
  sendRawTransaction,
  serializeDeterministicStateInitAction,
  serializeFunctionCallAction,
  serializeSignedTransaction,
  serializeTransaction,
  transactionHash,
} from "./protocol";
import type { RequestMessageJson } from "./walletContract";
import type { FinalExecutionOutcome } from "./types";

const EXECUTE_GAS = 300_000_000_000_000n; // 300 TGas
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
