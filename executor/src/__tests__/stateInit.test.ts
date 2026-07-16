import { base58, hex } from "@scure/base";
import { describe, expect, it } from "vitest";

import type { PasskeyPublicKey } from "../stateInit";
import {
  deriveAccountId,
  deriveAccountIdFromStateInit,
  publicKeyFromString,
  publicKeyToString,
  serializeDefaultStateInit,
  serializeDefaultWalletState,
  serializeStateInit,
} from "../stateInit";

// near-global-contracts-0.2.5 test_state_init_account_id_derivation vectors.
const DATA_ENTRY: readonly [Uint8Array, Uint8Array] = [
  new Uint8Array([0, 1, 2]),
  new Uint8Array([3, 4, 5]),
];

describe("NEP-616 derive_account_id (near-global-contracts vectors)", () => {
  it("code hash binding", () => {
    const stateInit = serializeStateInit(
      { hash: "J86LNmZE9nHAxRqUYBZ64iCQYfeacMJhNqvb8WQmpZPE" },
      [DATA_ENTRY],
    );
    expect(deriveAccountIdFromStateInit(stateInit)).toBe(
      "0s48ddf87e648de3a52783ee9640e618234cadb18f",
    );
  });

  it("account id binding", () => {
    const stateInit = serializeStateInit({ account_id: "alice.near" }, [DATA_ENTRY]);
    expect(deriveAccountIdFromStateInit(stateInit)).toBe(
      "0sf4d27a587616342eb45b8d785addbe6790695a2e",
    );
  });
});

const P256_KEY: PasskeyPublicKey = {
  curve: "p256",
  bytes: new Uint8Array([0x02, ...Array.from({ length: 32 }, (_, i) => i + 1)]),
};

const ED25519_KEY: PasskeyPublicKey = {
  curve: "ed25519",
  bytes: new Uint8Array(Array.from({ length: 32 }, (_, i) => 32 - i)),
};

describe("default wallet State borsh", () => {
  it("p256 layout: bool + u32 + [u8;33] + nonces + extensions", () => {
    const state = serializeDefaultWalletState(P256_KEY);
    // 1 + 4 + 33 + (4 + 8 + 4 + 4) + 4
    expect(state.length).toBe(62);
    expect(state[0]).toBe(1); // signature_enabled
    expect(hex.encode(state.slice(1, 5))).toBe("00000000"); // subwallet_id
    expect(state.slice(5, 38)).toEqual(P256_KEY.bytes);
    expect(hex.encode(state.slice(38, 42))).toBe("100e0000"); // timeout 3600 LE
    expect(hex.encode(state.slice(42, 62))).toBe("0".repeat(40)); // rest zeroed
  });

  it("ed25519 layout: [u8;32] key", () => {
    const state = serializeDefaultWalletState(ED25519_KEY);
    expect(state.length).toBe(61);
    expect(state.slice(5, 37)).toEqual(ED25519_KEY.bytes);
  });
});

describe("deterministic passkey account ids", () => {
  it("are 42-char '0s' + lowercase-hex account ids", () => {
    for (const key of [P256_KEY, ED25519_KEY]) {
      const accountId = deriveAccountId(key);
      expect(accountId).toMatch(/^0s[0-9a-f]{40}$/);
      expect(accountId.length).toBe(42);
    }
  });

  it("differ per key and are stable across calls", () => {
    expect(deriveAccountId(P256_KEY)).not.toBe(deriveAccountId(ED25519_KEY));
    expect(deriveAccountId(P256_KEY)).toBe(deriveAccountId(P256_KEY));
  });

  // Self-pinned full vectors: any change to the State/StateInit layout or the
  // factory id breaks these on purpose.
  it("pins the full p256 vector", () => {
    expect(hex.encode(serializeDefaultStateInit(P256_KEY))).toBe(
      "000127000000703235362d706173736b65792d77616c6c65742d636f6e74726163" +
        "742e7472657a752e6e6561720100000000000000" +
        "3e000000" + // value: Vec<u8> of 62 bytes
        "0100000000" +
        "020102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20" +
        "100e0000" +
        "0000000000000000" +
        "000000000000000000000000",
    );
    expect(deriveAccountId(P256_KEY)).toBe("0s9dcb623ddaebc66fffc13ed50e61a3041ddae822");
  });

  it("pins the full ed25519 vector", () => {
    expect(deriveAccountId(ED25519_KEY)).toBe("0s4a151d5470d41fc61df1270f6b20fd453e67b171");
  });
});

describe("public key string codec", () => {
  it("round-trips", () => {
    for (const key of [P256_KEY, ED25519_KEY]) {
      const str = publicKeyToString(key);
      const parsed = publicKeyFromString(str);
      expect(parsed.curve).toBe(key.curve);
      expect(parsed.bytes).toEqual(key.bytes);
      expect(str.startsWith(`${key.curve}:`)).toBe(true);
      expect(base58.decode(str.split(":")[1] as string)).toEqual(key.bytes);
    }
  });

  it("rejects malformed keys", () => {
    expect(() => publicKeyFromString("p256:111")).toThrow();
    expect(() => publicKeyFromString("secp256k1:abc")).toThrow();
  });
});
