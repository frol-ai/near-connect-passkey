import type { Client } from "near-api-ts";
import { createClient, isNatError } from "near-api-ts";
import { sha256 } from "@noble/hashes/sha2.js";
import { base64 } from "@scure/base";

import { BorshWriter } from "./borsh";
import { CHAIN_ID, DEFAULT_RPC_URLS } from "./constants";
import {
  DEFAULT_WALLET_CONFIG,
  buildAuthMessage,
  buildAuthorizationBlob,
} from "./authEnvelope";
import { registryGet, registryRegister } from "./registry";
import { buildSignedDelegateAction, relayExecuteSigned, relayStateInit } from "./relayer";
import type { PasskeyPublicKey } from "./stateInit";
import {
  deriveAccountId,
  publicKeyFromString,
  publicKeyToString,
  serializeDefaultStateInit,
} from "./stateInit";
import * as storage from "./storage";
import type {
  Account,
  AccountWithSignedMessage,
  ActiveCredential,
  ConnectorAction,
  FinalExecutionOutcome,
  ResolveAuthParams,
  ResolveAuthResponse,
  SignAndSendTransactionParams,
  SignAndSendTransactionsParams,
  SignDelegateActionsParams,
  SignDelegateActionsResponse,
  SignInAndSignMessageParams,
  SignInParams,
  SignMessageParams,
  SignedMessage,
  WebauthnGetResult,
} from "./types";
import { selector } from "./types";
import * as ui from "./ui";
import type { RequestJson, RequestMessageJson } from "./walletContract";
import {
  buildRequestMessage,
  connectorActionsToPromises,
  requestMessageHash,
} from "./walletContract";
import {
  b64ToRawId,
  buildProof,
  extractCredentialPublicKey,
  rawIdToB64,
  verifyAssertion,
} from "./webauthn";
import type { AuthMessageJson } from "./walletContract";
import { authMessageHash } from "./walletContract";

// ─── Environment ─────────────────────────────────────────────────────────────

let cachedClient: Client | null = null;

function rpcUrls(): string[] {
  // dApps often construct NearConnector without custom `providers`, in
  // which case the sandbox injects an EMPTY list — fall back to defaults.
  const urls = selector().providers.mainnet;
  return urls && urls.length > 0 ? urls : [...DEFAULT_RPC_URLS];
}

function rpcUrl(): string {
  const url = rpcUrls()[0];
  if (!url) throw new Error("no mainnet RPC provider configured");
  return url;
}

function getClient(): Client {
  if (!cachedClient) {
    cachedClient = createClient({
      transport: {
        rpcEndpoints: { regular: rpcUrls().map((url) => ({ url })) },
      },
    });
  }
  return cachedClient;
}

function assertMainnet(network?: string): void {
  if (network && network !== CHAIN_ID) {
    throw new Error("Passkey wallet supports mainnet only");
  }
}

async function accountExists(client: Client, accountId: string): Promise<boolean> {
  const info = await client.safeGetAccountInfo({ accountId });
  if (info.ok) return true;
  if (isNatError(info.error, "Client.GetAccountInfo.Rpc.Account.NotFound")) return false;
  throw info.error;
}

// ─── WebAuthn ceremonies ─────────────────────────────────────────────────────

function randomBytes(length: number): number[] {
  return Array.from(crypto.getRandomValues(new Uint8Array(length)));
}

async function webauthnCreate(name: string) {
  return selector().webauthn.create({
    challenge: randomBytes(32),
    rp: { name },
    user: { id: randomBytes(16), name, displayName: name },
    pubKeyCredParams: [
      { alg: -8, type: "public-key" }, // EdDSA (Ed25519)
      { alg: -7, type: "public-key" }, // ES256 (P-256)
    ],
    authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
    attestation: "none",
  });
}

async function webauthnGet(
  challenge: Uint8Array,
  rawIdB64?: string,
): Promise<WebauthnGetResult> {
  const options: Record<string, unknown> = {
    challenge: Array.from(challenge),
    userVerification: "preferred",
  };
  if (rawIdB64) {
    options["allowCredentials"] = [
      { id: b64ToRawId(rawIdB64), type: "public-key" },
    ];
  }
  return selector().webauthn.get(options);
}

// ─── Credential resolution ───────────────────────────────────────────────────

interface ResolvedCredential {
  rawIdB64: string;
  publicKey: PasskeyPublicKey;
  accountId: string;
}

/**
 * Map an assertion's rawId to its verified public key: local cache first,
 * registry on miss; every candidate is verified against the assertion
 * signature — only the credential's true key is accepted.
 */
async function resolveCredential(assertion: WebauthnGetResult): Promise<ResolvedCredential> {
  const rawIdB64 = rawIdToB64(assertion.rawId);

  const known = await storage.getKnownCredentials();
  const cached = known[rawIdB64];
  const candidates: string[] = cached ? [cached.publicKey] : [];

  if (candidates.length === 0) {
    candidates.push(...(await registryGet(getClient(), rawIdB64)));
  }

  for (const candidate of candidates) {
    let publicKey: PasskeyPublicKey;
    try {
      publicKey = publicKeyFromString(candidate);
    } catch {
      continue;
    }
    if (verifyAssertion(publicKey, assertion)) {
      const accountId = deriveAccountId(publicKey);
      await storage.addKnownCredential(rawIdB64, {
        publicKey: candidate,
        curve: publicKey.curve,
        accountId,
      });
      return { rawIdB64, publicKey, accountId };
    }
  }

  throw new Error(
    "This passkey is not registered in the passkeys registry (or the registered keys " +
      "do not match its signature). Create it again on the original device or register it first.",
  );
}

function toActiveCredential(resolved: ResolvedCredential): ActiveCredential {
  return {
    rawId: resolved.rawIdB64,
    publicKey: publicKeyToString(resolved.publicKey),
    curve: resolved.publicKey.curve,
    accountId: resolved.accountId,
    registeredAt: Date.now(),
  };
}

function toAccount(active: ActiveCredential): Account {
  return { accountId: active.accountId, publicKey: active.publicKey };
}

// ─── Registration ────────────────────────────────────────────────────────────

/** Register with the on-chain registry; on hard failure offer Retry/Cancel. */
async function registerWithUi(rawIdB64: string, publicKey: string): Promise<void> {
  for (;;) {
    try {
      await registryRegister(getClient(), rawIdB64, publicKey);
      return;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const retry = await ui.promptRetryRegistration(message);
      if (!retry) {
        throw new Error(`Passkey registration cancelled: ${message}`);
      }
      await ui.showProgress("Registering your passkey", "Publishing its public key on NEAR…");
    }
  }
}

/** A pending registration must reach the registry before any new create(). */
async function retryPendingRegistration(): Promise<void> {
  const pending = await storage.getPendingRegistration();
  if (!pending) return;
  await registerWithUi(pending.rawIdB64, pending.publicKey);
  await storage.clearPendingRegistration();
  const publicKey = publicKeyFromString(pending.publicKey);
  await storage.addKnownCredential(pending.rawIdB64, {
    publicKey: pending.publicKey,
    curve: pending.curve,
    accountId: deriveAccountId(publicKey),
  });
}

async function createNewPasskey(): Promise<ActiveCredential> {
  const name = await ui.promptPasskeyName();
  await ui.showProgress("Create your passkey", "Follow your device's Face ID / Touch ID prompt");
  const created = await webauthnCreate(name);
  await ui.showProgress("Registering your passkey", "Publishing its public key on NEAR…");
  const publicKey = extractCredentialPublicKey(created);
  const publicKeyStr = publicKeyToString(publicKey);
  const rawIdB64 = rawIdToB64(created.rawId);
  const accountId = deriveAccountId(publicKey);

  // Persist BEFORE registering so an interrupted registration is retried
  // on the next signIn instead of losing the key mapping forever.
  await storage.setPendingRegistration({
    rawIdB64,
    publicKey: publicKeyStr,
    curve: publicKey.curve,
  });
  await registerWithUi(rawIdB64, publicKeyStr);
  await storage.clearPendingRegistration();

  await storage.addKnownCredential(rawIdB64, {
    publicKey: publicKeyStr,
    curve: publicKey.curve,
    accountId,
  });
  const active: ActiveCredential = {
    rawId: rawIdB64,
    publicKey: publicKeyStr,
    curve: publicKey.curve,
    accountId,
    registeredAt: Date.now(),
  };
  await storage.setActiveCredential(active);
  return active;
}

async function useExistingPasskey(): Promise<ActiveCredential> {
  await ui.showProgress("Use your passkey", "Pick a passkey and confirm with Face ID / Touch ID");
  const assertion = await webauthnGet(new Uint8Array(randomBytes(32)));
  await ui.showProgress("Looking up your account", "Resolving your passkey on NEAR…");
  let resolved: ResolvedCredential;
  try {
    resolved = await resolveCredential(assertion);
  } catch (e) {
    await ui.showErrorDialog(
      "Passkey not registered",
      e instanceof Error ? e.message : String(e),
    );
    throw e;
  }
  const active = toActiveCredential(resolved);
  await storage.setActiveCredential(active);
  return active;
}

// ─── Signing primitives ──────────────────────────────────────────────────────

async function requireActive(): Promise<ActiveCredential> {
  const active = await storage.getActiveCredential();
  if (!active) throw new Error("Wallet not signed in");
  return active;
}

async function signRequestMessage(
  active: ActiveCredential,
  request: RequestJson,
): Promise<{ msg: RequestMessageJson; proof: string }> {
  const msg = buildRequestMessage(active.accountId, await storage.nextNonce(), request);
  await ui.showProgress("Approve transaction", "Confirm with Face ID / Touch ID");
  try {
    const assertion = await webauthnGet(requestMessageHash(msg), active.rawId);
    return { msg, proof: buildProof(active.curve, assertion) };
  } finally {
    await ui.closeUi();
  }
}

async function executeRequest(
  active: ActiveCredential,
  request: RequestJson,
): Promise<FinalExecutionOutcome> {
  const client = getClient();
  const { msg, proof } = await signRequestMessage(active, request);
  const exists = await accountExists(client, active.accountId);
  const stateInit = exists
    ? null
    : serializeDefaultStateInit(publicKeyFromString(active.publicKey));
  return relayExecuteSigned(client, rpcUrl(), active.accountId, msg, proof, stateInit);
}

/** Ensure the deterministic account exists on-chain (StateInit-only relay). */
async function ensureAccountOnChain(active: ActiveCredential): Promise<void> {
  const client = getClient();
  if (await accountExists(client, active.accountId)) return;
  await relayStateInit(
    client,
    rpcUrl(),
    active.accountId,
    serializeDefaultStateInit(publicKeyFromString(active.publicKey)),
  );
}

// ─── NEP-413 ────────────────────────────────────────────────────────────────

const NEP413_TAG = 2 ** 31 + 413;

function nep413PayloadHash(message: string, recipient: string, nonce: Uint8Array): Uint8Array {
  if (nonce.length !== 32) throw new Error("NEP-413 nonce must be 32 bytes");
  const w = new BorshWriter();
  w.writeU32(NEP413_TAG);
  w.writeString(message);
  w.writeFixedBytes(nonce);
  w.writeString(recipient);
  w.writeU8(0); // callbackUrl: None
  return sha256(w.toBytes());
}

// ─── Wallet ─────────────────────────────────────────────────────────────────

const wallet = {
  // Overwritten by `selector.ready()` with the real manifest.
  manifest: {} as Record<string, unknown>,

  async signIn(params?: SignInParams): Promise<Account[]> {
    assertMainnet(params?.network);
    if (params?.addFunctionCallKey) {
      throw new Error("Function-call access keys are not supported by passkey wallet accounts");
    }

    await retryPendingRegistration();

    const existing = await storage.getActiveCredential();
    if (existing) return [toAccount(existing)];

    const choice = await ui.promptSignInChoice();
    try {
      const active = choice === "create" ? await createNewPasskey() : await useExistingPasskey();
      return [toAccount(active)];
    } finally {
      await ui.closeUi();
    }
  },

  async signInAndSignMessage(
    params: SignInAndSignMessageParams,
  ): Promise<AccountWithSignedMessage[]> {
    const accounts = await this.signIn(params);
    const account = accounts[0];
    if (!account) throw new Error("sign-in produced no account");
    const signedMessage = await this.signMessage({
      message: params.messageParams.message,
      recipient: params.messageParams.recipient,
      nonce: params.messageParams.nonce,
      network: params.network,
    });
    return [{ ...account, signedMessage }];
  },

  async signOut(): Promise<void> {
    // Keep `passkey:known` — verified rawId -> key mappings stay valid.
    await storage.clearActiveCredential();
  },

  async getAccounts(): Promise<Account[]> {
    const active = await storage.getActiveCredential();
    return active ? [toAccount(active)] : [];
  },

  async signMessage(params: SignMessageParams): Promise<SignedMessage> {
    assertMainnet(params.network);
    const active = await requireActive();

    const nonce =
      params.nonce instanceof Uint8Array ? params.nonce : new Uint8Array(params.nonce);
    const challenge = nep413PayloadHash(params.message, params.recipient, nonce);
    const assertion = await webauthnGet(challenge, active.rawId);
    const proof = buildProof(active.curve, assertion);

    return {
      accountId: active.accountId,
      publicKey: active.publicKey,
      signature: base64.encode(new TextEncoder().encode(proof)),
    };
  },

  async signAndSendTransaction(
    params: SignAndSendTransactionParams,
  ): Promise<FinalExecutionOutcome> {
    assertMainnet(params.network);
    const active = await requireActive();
    const request: RequestJson = {
      external: connectorActionsToPromises([
        { receiverId: params.receiverId, actions: params.actions },
      ]),
    };
    return executeRequest(active, request);
  },

  async signAndSendTransactions(
    params: SignAndSendTransactionsParams,
  ): Promise<FinalExecutionOutcome[]> {
    assertMainnet(params.network);
    const active = await requireActive();
    // All transactions are bundled into a single wallet-contract request
    // (fan-out promises) and settle atomically in one relayed transaction.
    const request: RequestJson = {
      external: connectorActionsToPromises(params.transactions),
    };
    const outcome = await executeRequest(active, request);
    return params.transactions.map(() => outcome);
  },

  async signDelegateActions(
    params: SignDelegateActionsParams,
  ): Promise<SignDelegateActionsResponse> {
    assertMainnet(params.network);
    const active = await requireActive();

    const request: RequestJson = {
      external: connectorActionsToPromises(
        params.delegateActions.map((d) => ({
          receiverId: d.receiverId,
          actions: d.actions as ConnectorAction[],
        })),
      ),
    };
    const { msg, proof } = await signRequestMessage(active, request);

    // The dApp relays this via nt-be, which replays the inner w_execute_signed
    // as the sponsor and cannot create the account — so it must already exist
    // (the delegate action carries no StateInit).
    await ensureAccountOnChain(active);

    // Standard borsh SignedDelegateAction (NEP-461) wrapping a single
    // w_execute_signed(msg, proof) FunctionCall on the wallet account.
    const signedDelegateAction = await buildSignedDelegateAction(
      getClient(),
      active.accountId,
      msg,
      proof,
    );
    return { signedDelegateActions: [signedDelegateAction] };
  },

  async resolveAuth(params: ResolveAuthParams): Promise<ResolveAuthResponse> {
    assertMainnet(params.network);

    // The Code binding commits to the account's INITIAL state (the contract
    // reconstructs the NEP-616 StateInit from the envelope + its stored
    // public key and checks the derived account id), so the envelope is
    // always built from the defaults this executor creates wallets with —
    // it stays valid even after on-chain config mutations.

    const signedIn = await storage.getActiveCredential();
    const message = buildAuthMessage({ ...params, config: DEFAULT_WALLET_CONFIG });
    const challenge = authMessageHash(message);

    if (signedIn) {
      try {
        await ui.showProgress("Confirm sign-in", "Confirm with Face ID / Touch ID");
        const assertion = await webauthnGet(challenge, signedIn.rawId);
        await ui.showProgress("Signing you in", "Finalizing your account on NEAR…");
        await ensureAccountOnChain(signedIn);
        return {
          accountId: signedIn.accountId,
          authorization: buildAuthorizationBlob(message, buildProof(signedIn.curve, assertion)),
        };
      } finally {
        await ui.closeUi();
      }
    }

    // No active credential: guide the user from the very first moment —
    // create a new account or pick an existing passkey, with visible
    // progress for every step after that.
    await retryPendingRegistration();
    const choice = await ui.promptSignInChoice();

    try {
      if (choice === "create") {
        const active = await createNewPasskey();
        await ui.showProgress("Confirm sign-in", "Confirm once more with Face ID / Touch ID");
        const assertion = await webauthnGet(challenge, active.rawId);
        await ui.showProgress("Signing you in", "Setting up your account on NEAR…");
        await ensureAccountOnChain(active);
        return {
          accountId: active.accountId,
          authorization: buildAuthorizationBlob(message, buildProof(active.curve, assertion)),
        };
      }

      // Existing passkey: one discovery ceremony (the envelope is
      // curve-independent), then resolve the credential from the assertion
      // itself (local cache first, registry on miss, verified against the
      // signature).
      await ui.showProgress("Use your passkey", "Pick a passkey and confirm with Face ID / Touch ID");
      const assertion = await webauthnGet(challenge);
      await ui.showProgress("Looking up your account", "Resolving your passkey on NEAR…");
      let resolved: ResolvedCredential;
      try {
        resolved = await resolveCredential(assertion);
      } catch (e) {
        await ui.showErrorDialog(
          "Passkey not registered",
          e instanceof Error ? e.message : String(e),
        );
        throw e;
      }

      const active = toActiveCredential(resolved);
      await storage.setActiveCredential(active);
      await ui.showProgress("Signing you in", "Setting up your account on NEAR…");
      try {
        await ensureAccountOnChain(active);
      } catch (e) {
        // Roll back only freshly-established local state (verified `passkey:known`
        // write-through stays — it is true regardless of relay hiccups).
        await storage.clearActiveCredential();
        throw e;
      }

      return {
        accountId: resolved.accountId,
        authorization: buildAuthorizationBlob(
          message,
          buildProof(resolved.publicKey.curve, assertion),
        ),
      };
    } finally {
      await ui.closeUi();
    }
  },
};

selector().ready(wallet);
