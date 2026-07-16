import type { Client } from "near-api-ts";
import { createMemoryKeyService, createMemorySigner, functionCall } from "near-api-ts";

import { REGISTRY_FC_PRIVATE_KEY, REGISTRY_ID } from "./constants";

/** All public key candidates ever registered for a rawId (possibly empty). */
export async function registryGet(client: Client, rawIdB64: string): Promise<string[]> {
  const { result } = await client.callContractReadFunction({
    contractAccountId: REGISTRY_ID,
    functionName: "get",
    functionArgs: { passkey_raw_id: rawIdB64 },
  });
  return Array.isArray(result) ? result.filter((k): k is string => typeof k === "string") : [];
}

const REGISTER_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 1_000;

/**
 * Register a rawId -> publicKey mapping via the embedded function-call key.
 * Retries {@link REGISTER_ATTEMPTS} times with exponential backoff and
 * throws when it never succeeds — callers MUST treat that as a hard failure.
 */
export async function registryRegister(
  client: Client,
  rawIdB64: string,
  publicKey: string,
): Promise<void> {
  if (!REGISTRY_FC_PRIVATE_KEY) {
    throw new Error(
      "Passkey registry key is not configured (REGISTRY_FC_PRIVATE_KEY is empty in constants.ts). " +
        "Registration cannot proceed — fill in the function-call key for " +
        `${REGISTRY_ID} before shipping this executor.`,
    );
  }

  const signer = createMemorySigner({
    signerAccountId: REGISTRY_ID,
    client,
    keyService: createMemoryKeyService({
      keySource: { privateKey: REGISTRY_FC_PRIVATE_KEY as `ed25519:${string}` },
    }),
  });

  let lastError: unknown;
  for (let attempt = 0; attempt < REGISTER_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, BACKOFF_BASE_MS * 2 ** (attempt - 1)));
    }
    try {
      await signer.executeTransaction({
        intent: {
          receiverAccountId: REGISTRY_ID,
          action: functionCall({
            functionName: "register",
            functionArgs: { passkey_raw_id: rawIdB64, passkey_public_key: publicKey },
            gasLimit: { teraGas: "15" },
          }),
        },
      });
      return;
    } catch (e) {
      lastError = e;
    }
  }
  throw new Error(
    `Passkey registration failed after ${REGISTER_ATTEMPTS} attempts: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}
