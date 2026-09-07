# near-connect-passkey

Standalone [NEAR Connect](https://github.com/NEAR-DevHub/near-connect) wallet
executor for **Passkeys** (WebAuthn), plus the on-chain
**passkeys registry** contract it relies on.

A passkey-controlled NEAR account is a deterministic
([NEP-616](https://github.com/near/NEPs/blob/master/neps/nep-0616.md))
`0s…` account running the
[`near/intents` wallet contract](https://github.com/near/intents/tree/main/contracts/wallet)
WebAuthn variant, referenced as a
[NEP-591](https://github.com/near/NEPs/blob/master/neps/nep-0591.md) global
contract by account id — one per credential curve, since each variant embeds
a curve-specific verifier and state layout:

| Curve | Global contract id | NEP-330 standard |
|---|---|---|
| ES256 / P-256 | `0saf343be226341c0eca7dba6d0b29d49bdff3ad03` | `wallet-webauthn-p256` |
| EdDSA / Ed25519 | `0sa7ed6ace79f0fd97313c465fd72a774990048501` | `wallet-webauthn-ed25519` |

(both built from `near/intents@32a7836f` and published via the intents Global
Deployer; `cd executor && npm run verify-contracts` re-checks the mapping
against the on-chain metadata).
The passkey's public key **is** the identity: `account_id = f(code, initial state)`.
Authentication uses
[NEP-641](https://github.com/near/NEPs/blob/master/neps/nep-0641.md)
`w_resolve_auth(path, authorization)` with an `OffchainMessage` bound to the
wallet account id; re-login from a new device therefore takes a discovery
`credentials.get()` to identify the passkey followed by the signing ceremony.

## Repository layout

| Path | What |
|------|------|
| `contract/` | `passkeys-registry` contract (Rust, near-sdk) |
| `executor/` | NEAR Connect executor (TypeScript, Vite IIFE build) |
| `passkey-executor.js` | committed build artifact served to dApps |

## The registry (`passkeys-registry.near`)

WebAuthn exposes a credential's public key exactly once — at
`credentials.create()`. A later `credentials.get()` (new device, synced
passkey) returns only `rawId`. The registry is the `rawId -> publicKey`
phonebook that makes account recovery possible:

```rust
pub fn register(passkey_raw_id: String, passkey_public_key: String); // idempotent
pub fn get(passkey_raw_id: String) -> Vec<String>;                   // [] if unknown
```

- `passkey_raw_id`: base64url (unpadded), 16..=1023 bytes decoded (WebAuthn spec bounds)
- `passkey_public_key`: `p256:<base58(SEC-1 compressed, 33 bytes)>` (COSE -7)
  or `ed25519:<base58(32 bytes)>` (COSE -8)
- at most **8** keys per `rawId`

**Trust model:** registration is open by design — writes go through a
function-call access key restricted to `register`, whose private key ships
inside the public executor (self-serving registration, no backend). A wrong
mapping can't forge anything: clients verify the WebAuthn assertion signature
against every returned candidate; only the credential's true key verifies.
Worst-case abuse is storage-staking drain of the contract balance
(~0.001 NEAR per registration) and cap-filling a `rawId` — which requires
guessing a >=100-bit-entropy credential id first.

The executor also keeps a local `rawId -> publicKey` cache
(`passkey:known` in NEAR Connect sandbox storage), so the registry is only
consulted for passkeys never seen on that browser.

### Deploy runbook

```sh
cd contract

# 1. Build (reproducible)
cargo near build reproducible-wasm

# 2. Deploy (no init call needed — state initializes lazily)
near contract deploy passkeys-registry.near \
  use-file ./target/near/passkeys_registry.wasm \
  without-init-call \
  network-config mainnet \
  sign-with-legacy-keychain \
  send

# 3. Generate a fresh ed25519 keypair OFFLINE.
#    This key pair is PUBLIC BY DESIGN once shipped in the executor:
#    it must never be reused anywhere else.
near account generate-keypair   # or any offline keygen

# 4. Add it as a function-call access key restricted to `register`
#    (no allowance = unlimited gas allowance)
near account add-key passkeys-registry.near \
  grant-function-call-access \
  --receiver-account-id passkeys-registry.near \
  --method-names 'register' \
  use-manually-provided-public-key ed25519:<PUBLIC_KEY> \
  network-config mainnet \
  sign-with-legacy-keychain \
  send

# 5. Paste the PRIVATE key into executor/src/constants.ts
#    (REGISTRY_FC_PRIVATE_KEY) and rebuild the executor.
```

Operations: keep a modest balance (~5 NEAR ≈ 5000 registrations) on
`passkeys-registry.near`, monitor it, and rotate the function-call key with
the root (legacy keychain) key if abused.

### Tests

```sh
cd contract
cargo test --lib                        # unit tests
cargo near build non-reproducible-wasm  # build wasm for sandbox tests
cargo test --test registry              # near-sandbox integration tests
```

## The executor

See [`executor/README.md`](executor/README.md).

Manifest entry (dApps can also register it locally via
`connector.registerWallet(...)`):

```json
{
  "id": "passkey",
  "name": "Passkey",
  "executor": "<https URL of passkey-executor.js>",
  "type": "sandbox",
  "features": { "signMessage": true, "signDelegateActions": true, "resolveAuth": true, "mainnet": true, "testnet": false },
  "permissions": { "storage": true, "webauthn": true }
}
```

> **rpId scoping:** NEAR Connect runs WebAuthn ceremonies in the dApp's
> top-level window, so passkeys are scoped to the dApp domain (e.g.
> `trezu.app`). The registry is global, but a credential only surfaces on
> the domain it was created for.
