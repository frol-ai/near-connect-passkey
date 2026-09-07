#!/usr/bin/env node
// Verify that WALLET_CODE_IDS in src/constants.ts point at global contracts
// whose on-chain NEP-330 metadata declares the expected curve variant
// (`wallet-webauthn-p256` / `wallet-webauthn-ed25519`). A swapped mapping
// would derive account ids whose contract cannot deserialize its own state.
//
// Usage: npm run verify-contracts [-- <rpc-url>]
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const rpcUrl = process.argv[2] ?? "https://free.rpc.fastnear.com";
const constants = readFileSync(
  fileURLToPath(new URL("../src/constants.ts", import.meta.url)),
  "utf8",
);
const block = /WALLET_CODE_IDS = \{([^}]*)\}/.exec(constants)?.[1] ?? "";
const ids = Object.fromEntries(
  [...block.matchAll(/(p256|ed25519):\s*"([^"]+)"/g)].map((m) => [m[1], m[2]]),
);
if (!ids.p256 || !ids.ed25519) throw new Error("WALLET_CODE_IDS not found in src/constants.ts");

async function globalCode(accountId) {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "query",
      params: {
        request_type: "view_global_contract_code_by_account_id",
        finality: "final",
        account_id: accountId,
      },
    }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`${accountId}: ${JSON.stringify(json.error)}`);
  return Buffer.from(json.result.code_base64, "base64");
}

let ok = true;
for (const [curve, accountId] of Object.entries(ids)) {
  const wasm = await globalCode(accountId);
  const text = wasm.toString("latin1");
  const start = text.indexOf('{"version":"');
  const metadata = start >= 0 ? text.slice(start, text.indexOf("}}", start) + 2) : "";
  const standards = [...metadata.matchAll(/"standard":"(wallet-webauthn-[a-z0-9]+)"/g)].map((m) => m[1]);
  const expected = `wallet-webauthn-${curve}`;
  const link = /"link":"([^"]+)"/.exec(metadata)?.[1] ?? "?";
  const good = standards.includes(expected);
  ok &&= good;
  console.log(
    `${good ? "OK  " : "FAIL"} ${curve.padEnd(7)} ${accountId}  ${standards.join(",") || "<no wallet-webauthn standard>"}  ${link}`,
  );
}
if (!ok) {
  console.error("WALLET_CODE_IDS curve mapping does not match on-chain metadata");
  process.exit(1);
}
