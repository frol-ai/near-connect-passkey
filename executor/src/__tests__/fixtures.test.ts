import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { base64, hex } from "@scure/base";
import { describe, expect, it } from "vitest";

import { buildAuthorizationBlob } from "../authEnvelope";
import { WALLET_CODE_IDS } from "../constants";
import {
  defaultStateInitJson,
  deriveAccountId,
  publicKeyFromString,
  serializeDefaultStateInit,
  serializeDefaultWalletState,
} from "../stateInit";
import type {
  OffchainMessageJson,
  RequestMessageJson,
  StateInitJson,
  WalletAuthorizationJson,
} from "../walletContract";
import {
  offchainMessageHash,
  offchainMessageToWireJson,
  requestMessageHash,
  requestMessageToWireJson,
  serializeRequestMessage,
} from "../walletContract";

interface Fixture {
  offchain: Array<{
    name: string;
    message: OffchainMessageJson;
    hash: string;
    authorization: string;
  }>;
  request: Array<{ name: string; message: RequestMessageJson; borsh: string; hash: string }>;
  state: Record<
    "p256" | "ed25519",
    {
      public_key: string;
      state_borsh: string;
      state_init_json: StateInitJson;
      state_init_borsh: string;
      account_id: string;
    }
  > & { p256_real: { public_key: string; account_id: string } };
}

const fixture: Fixture = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../fixtures/wallet-vectors.json", import.meta.url)),
    "utf8",
  ),
);

describe("NEP-641 OffchainMessage vectors (defuse_nep641::OffchainMessage)", () => {
  it("has vectors", () => {
    expect(fixture.offchain.length).toBeGreaterThanOrEqual(4);
  });

  for (const vector of fixture.offchain) {
    describe(vector.name, () => {
      it("reproduces the canonical hash from the JSON wire form", () => {
        expect(hex.encode(offchainMessageHash(vector.message))).toBe(vector.hash);
      });

      it("re-serializes to the identical JSON wire form", () => {
        expect(offchainMessageToWireJson(vector.message)).toEqual(vector.message);
      });

      it("wraps into the identical WalletAuthorization::Signature blob", () => {
        const blob = buildAuthorizationBlob(vector.message, "<proof>");
        expect(JSON.parse(blob) as WalletAuthorizationJson).toEqual(JSON.parse(vector.authorization));
      });
    });
  }

  it("upstream doc-test vector (crates/signatures/nep641/src/message.rs)", () => {
    const msg: OffchainMessageJson = {
      chain_id: "mainnet",
      signer_id: "extension.near",
      path: ["wallet.near"],
      timestamp: "2026-08-05T07:28:00.123456789Z",
      payload: "Hello, Near!",
    };
    expect(hex.encode(offchainMessageHash(msg))).toBe(
      "ac9fc5df2a1da51c4e0446185c8e5b58b65f37d12c544d144fa8f026239962ae",
    );
  });

  it("treats an absent and an empty path identically", () => {
    const base: OffchainMessageJson = {
      chain_id: "mainnet",
      signer_id: "0s0000000000000000000000000000000000000000",
      timestamp: "1970-01-01T00:00:00Z",
      payload: "",
    };
    expect(offchainMessageHash({ ...base, path: [] })).toEqual(offchainMessageHash(base));
    expect(offchainMessageToWireJson({ ...base, path: [] })).not.toHaveProperty("path");
  });
});

describe("RequestMessage vectors (contracts/wallet/src/message.rs)", () => {
  for (const vector of fixture.request) {
    describe(vector.name, () => {
      it("borsh-encodes identically (pay_for_gas first)", () => {
        expect(hex.encode(serializeRequestMessage(vector.message))).toBe(vector.borsh);
      });

      it("reproduces the canonical hash", () => {
        expect(hex.encode(requestMessageHash(vector.message))).toBe(vector.hash);
      });

      it("re-serializes to the identical JSON wire form", () => {
        expect(requestMessageToWireJson(vector.message)).toEqual(vector.message);
      });
    });
  }

  it("pay_for_gas=true flips the leading borsh byte and is kept on the wire", () => {
    const vector = fixture.request[0];
    if (!vector) throw new Error("missing vector");
    const paid: RequestMessageJson = { ...vector.message, pay_for_gas: true };
    const bytes = serializeRequestMessage(paid);
    expect(bytes[0]).toBe(1);
    expect(hex.encode(bytes.slice(1))).toBe(vector.borsh.slice(2));
    expect(requestMessageToWireJson(paid)).toHaveProperty("pay_for_gas", true);
  });
});

describe("default wallet State / StateInit for the deployed code ids", () => {
  for (const curve of ["p256", "ed25519"] as const) {
    describe(curve, () => {
      const vector = fixture.state[curve];
      const key = publicKeyFromString(vector.public_key);

      it("uses the deployed global-contract id", () => {
        expect(vector.state_init_json.V1.code).toEqual({ account_id: WALLET_CODE_IDS[curve] });
      });

      it("borsh(State) matches", () => {
        expect(hex.encode(serializeDefaultWalletState(key))).toBe(vector.state_borsh);
      });

      it("borsh(StateInit) matches", () => {
        expect(hex.encode(serializeDefaultStateInit(key))).toBe(vector.state_init_borsh);
      });

      it("JSON StateInit matches (empty key, base64 value)", () => {
        const json = defaultStateInitJson(key);
        expect(json).toEqual(vector.state_init_json);
        const value = json.V1.data[""];
        if (!value) throw new Error("STATE_KEY entry missing");
        expect(hex.encode(base64.decode(value))).toBe(vector.state_borsh);
      });

      it("derives the NEP-616 account id", () => {
        expect(deriveAccountId(key)).toBe(vector.account_id);
      });
    });
  }

  it("derives the account id of a real mainnet passkey (p256 verify_ok key)", () => {
    const key = publicKeyFromString(fixture.state.p256_real.public_key);
    expect(deriveAccountId(key)).toBe(fixture.state.p256_real.account_id);
  });
});
