import { hex } from "@scure/base";
import { describe, expect, it } from "vitest";

import type { RequestMessageJson } from "../walletContract";
import {
  nanosToRfc3339,
  requestMessageHash,
  rfc3339ToNanos,
  serializeRequestMessage,
} from "../walletContract";

describe("RequestMessage known-answer vectors (contracts/wallet/src/message.rs)", () => {
  it("empty request (doc-test vector)", () => {
    const msg: RequestMessageJson = {
      chain_id: "mainnet",
      signer_id: "0s0000000000000000000000000000000000000000",
      nonce: 0,
      created_at: "1970-01-01T00:00:00Z",
      timeout_secs: 3600,
      request: {},
    };
    expect(hex.encode(requestMessageHash(msg))).toBe(
      "e42ac706e27f0157624ee49fc4693c9cc9666c5e51358b7d57f79ee16005ded7",
    );
  });

  it("mainnet function_call vector (tx 6vytw7NgAiPkJ3KYAyt18es4mDnwZ8knjpB7LHVJejAL)", () => {
    const json = `{"nonce":2845491008,"request":{"external":[{"actions":[{"action":"function_call","payload":{"args":"eyJyZXF1ZXN0Ijp7InBheWxvYWRfdjIiOnsiRWNkc2EiOiIwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwIn0sImRvbWFpbl9pZCI6MCwicGF0aCI6IiJ9fQ==","deposit":"1","function_name":"sign"}}],"receiver_id":"v1.signer"}]},"chain_id":"mainnet","signer_id":"0se5eba21e8f191e1880e453794bc551dfa50a3419","created_at":"2026-07-07T11:13:29Z","timeout_secs":3600}`;
    const msg = JSON.parse(json) as RequestMessageJson;
    expect(hex.encode(requestMessageHash(msg))).toBe(
      "06f269191431372337a0c606a15822e349bd0d5ec317704f97bef1a4ed6f5e1d",
    );
  });

  it("NearPromise borsh layout pin (crates/near/promise doc-test vector)", () => {
    // The promise-level vector from defuse-near-promise's `borsh_has_not_changed`:
    // receiver "receiver.near", refund_to "refund.near",
    // state_init(global.near, 1 NEAR) + function_call(foo, 0x12345678, 2 NEAR,
    // 42 TGas, weight 2) + transfer(3 NEAR).
    const msg: RequestMessageJson = {
      chain_id: "x",
      signer_id: "y",
      nonce: 0,
      created_at: "1970-01-01T00:00:00Z",
      timeout_secs: 0,
      request: {
        external: [
          {
            receiver_id: "receiver.near",
            refund_to: "refund.near",
            actions: [
              {
                action: "deterministic_state_init",
                payload: {
                  state_init: { V1: { code: { account_id: "global.near" }, data: {} } },
                  deposit: "1000000000000000000000000",
                },
              },
              {
                action: "function_call",
                payload: {
                  function_name: "foo",
                  args: "EjRWeA==",
                  deposit: "2000000000000000000000000",
                  gas: "42000000000000",
                  gas_weight: "2",
                },
              },
              { action: "transfer", payload: { amount: "3000000000000000000000000" } },
            ],
          },
        ],
      },
    };
    const bytes = serializeRequestMessage(msg);
    const expectedPromise =
      "0d00000072656365697665722e6e656172010b000000726566756e642e6e656172030000000b00010b000000676c6f62616c2e6e65617200000000000000a1edccce1bc2d30000000000000203000000666f6f040000001234567800000042db999d3784a701000000000000a014e332260000020000000000000003000000e3c8666c53467b020000000000";
    expect(hex.encode(bytes)).toContain(expectedPromise);
  });
});

describe("RFC-3339 timestamp codec", () => {
  it.each([
    ["1970-01-01T00:00:00Z", 0n],
    ["2026-07-07T11:13:29Z", 1783422809_000000000n],
    ["2026-07-16T12:34:56.789Z", 1784205296_789000000n],
    ["2026-06-25T13:53:42.123456789Z", 1782395622_123456789n],
  ])("parses %s", (text, nanos) => {
    expect(rfc3339ToNanos(text)).toBe(nanos);
  });

  it.each([
    "1970-01-01T00:00:00Z",
    "2026-07-16T12:34:56.789Z",
    "2026-06-25T13:53:42.123456789Z",
  ])("round-trips %s", (text) => {
    expect(nanosToRfc3339(rfc3339ToNanos(text))).toBe(text);
  });

  it("normalizes offsets to Z", () => {
    expect(nanosToRfc3339(rfc3339ToNanos("1970-01-01T10:00:00+04:00"))).toBe(
      "1970-01-01T06:00:00Z",
    );
  });
});
