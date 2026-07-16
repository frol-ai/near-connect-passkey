import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { hex } from "@scure/base";
import { describe, expect, it } from "vitest";

import type { AuthMessageJson } from "../walletContract";
import { authMessageHash, authMessageToWireJson } from "../walletContract";

interface Fixture {
  vectors: Array<{ name: string; message: AuthMessageJson; hash: string }>;
}

const fixture: Fixture = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../fixtures/nep641-auth.json", import.meta.url)), "utf8"),
);

describe("NEP-641 AuthMessage shared vectors (fixtures/nep641-auth.json)", () => {
  it("has vectors", () => {
    expect(fixture.vectors.length).toBeGreaterThanOrEqual(3);
  });

  for (const vector of fixture.vectors) {
    describe(vector.name, () => {
      it("reproduces the canonical hash from the JSON wire form", () => {
        expect(hex.encode(authMessageHash(vector.message))).toBe(vector.hash);
      });

      it("re-serializes to the identical JSON wire form", () => {
        expect(authMessageToWireJson(vector.message)).toEqual(vector.message);
      });
    });
  }
});
