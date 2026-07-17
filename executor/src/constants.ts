/**
 * Global contracts (NEP-591, deployed by account id) running passkey
 * wallets — one per WebAuthn credential curve, since each wallet-contract
 * variant embeds a curve-specific verifier and state layout.
 */
export const FACTORY_IDS = {
  p256: "p256-passkey-wallet-contract.trezu.near",
  ed25519: "ed25519-passkey-wallet-contract.trezu.near",
} as const;

/** Open on-chain registry mapping WebAuthn rawId -> public key candidates. */
export const REGISTRY_ID = "passkeys-registry.near";

/**
 * Private key of the function-call access key on {@link REGISTRY_ID}
 * restricted to the `register` method. It ships inside this public executor
 * by design — the registry is an open phonebook, not an authority (clients
 * verify assertion signatures against every candidate key).
 *
 * PLACEHOLDER: must be filled before shipping. Registration flows throw a
 * clear error while it is empty.
 */
export const REGISTRY_FC_PRIVATE_KEY = "ed25519:3eDM1nB2hVs8mYminjBuBSxr7d4Gmd2JaAJhtmviVDQRm1zPGC7TxXoEwQsR9JBxDH3ax1U5RnfiAP3n4CZCfHXf";

/**
 * Sponsor (relayer) account used to submit wallet-contract transactions on
 * behalf of users (users' deterministic accounts hold no keys).
 *
 * PLACEHOLDER: must be filled before shipping. Use a DEDICATED, LOW-VALUE
 * account: its full-access key ships inside this public executor and anyone
 * can drain it for gas. Fund it with small amounts, top up automatically.
 */
export const SPONSOR_ACCOUNT_ID = "";
export const SPONSOR_PRIVATE_KEY = "";

/** Default wallet-contract nonce timeout (secs); also the message timeout we sign with. */
export const DEFAULT_TIMEOUT_SECS = 3600;

/** Domain prefix for NEP-641 AuthMessage hashing (SHA3-256). */
export const AUTH_DOMAIN = "NEAR_WALLET_CONTRACT_AUTH/V1";

/** Domain prefix for RequestMessage hashing (SHA3-256). */
export const REQUEST_DOMAIN = "NEAR_WALLET_CONTRACT/V1";

/** Chain id bound into every signed message. This executor is mainnet-only. */
export const CHAIN_ID = "mainnet";

/**
 * Fallback RPC endpoints, used when the host dApp configured no
 * `providers` on its NearConnector (the sandbox then injects an empty list).
 */
export const DEFAULT_RPC_URLS = [
  "https://free.rpc.fastnear.com",
  "https://rpc.mainnet.near.org",
] as const;

/** Storage keys (selector sandboxed storage). */
export const STORAGE_ACTIVE = "passkey:v1";
export const STORAGE_KNOWN = "passkey:known";
export const STORAGE_PENDING_REGISTRATION = "passkey:pendingRegistration";
export const STORAGE_NONCE = "passkey:nonce";
