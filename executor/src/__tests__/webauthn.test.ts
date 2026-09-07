import { ed25519 } from "@noble/curves/ed25519.js";
import { p256 } from "@noble/curves/nist.js";
import { base58, base64urlnopad, hex } from "@scure/base";
import { describe, expect, it } from "vitest";

import { concatBytes } from "../borsh";
import {
  assertionSignedBytes,
  authenticatorUserVerified,
  decodeCbor,
  derToRawLowS,
  extractCosePublicKey,
  extractCredentialPublicKey,
  extractSpkiPublicKey,
  buildProof,
  signatureToString,
  verifyAssertion,
} from "../webauthn";
import { requestMessageHash } from "../walletContract";
import { friendlyWebauthnError } from "../errors";

// ─── Minimal CBOR encoder (tests only) ───────────────────────────────────────

function cborHead(major: number, value: number): number[] {
  if (value < 24) return [(major << 5) | value];
  if (value < 256) return [(major << 5) | 24, value];
  return [(major << 5) | 25, value >> 8, value & 0xff];
}

function cborInt(value: number): number[] {
  return value >= 0 ? cborHead(0, value) : cborHead(1, -1 - value);
}

function cborBytes(bytes: Uint8Array): number[] {
  return [...cborHead(2, bytes.length), ...bytes];
}

function cborText(text: string): number[] {
  const bytes = new TextEncoder().encode(text);
  return [...cborHead(3, bytes.length), ...bytes];
}

function cborMap(entries: Array<[number[] | string, number[]]>): number[] {
  const out = cborHead(5, entries.length);
  for (const [key, value] of entries) {
    out.push(...(typeof key === "string" ? cborText(key) : key));
    out.push(...value);
  }
  return out;
}

// ─── Fabricated WebAuthn structures ──────────────────────────────────────────

const FLAGS_UP_UV_AT = 0b0100_0101;
const FLAGS_UP_UV = 0b0000_0101;

function fabricateAuthDataWithCose(coseKey: number[]): Uint8Array {
  const credId = new Uint8Array(16).fill(0xcd);
  return new Uint8Array([
    ...new Uint8Array(32).fill(0x11), // rpIdHash
    FLAGS_UP_UV_AT,
    0, 0, 0, 0, // signCount
    ...new Uint8Array(16).fill(0xaa), // aaguid
    0, credId.length, // credIdLen (BE)
    ...credId,
    ...coseKey,
  ]);
}

function fabricateAttestationObject(authData: Uint8Array): number[] {
  return cborMap([
    ["fmt", cborText("none")],
    ["attStmt", cborMap([])],
    ["authData", cborBytes(authData)],
  ]);
}

describe("COSE public key extraction", () => {
  it("extracts and compresses an ES256 (P-256) key", () => {
    const { secretKey } = p256.keygen();
    const uncompressed = p256.Point.fromBytes(p256.getPublicKey(secretKey)).toBytes(false);
    const x = uncompressed.slice(1, 33);
    const y = uncompressed.slice(33, 65);

    const cose = cborMap([
      [cborInt(1), cborInt(2)], // kty: EC2
      [cborInt(3), cborInt(-7)], // alg: ES256
      [cborInt(-1), cborInt(1)], // crv: P-256
      [cborInt(-2), cborBytes(x)],
      [cborInt(-3), cborBytes(y)],
    ]);

    const authData = fabricateAuthDataWithCose(cose);
    const key = extractCosePublicKey(authData);
    expect(key.curve).toBe("p256");
    expect(key.bytes).toEqual(p256.Point.fromBytes(uncompressed).toBytes(true));

    // Full attestation-object path (bridge without getPublicKey()).
    const viaAttestation = extractCredentialPublicKey({
      publicKey: null,
      attestationObject: fabricateAttestationObject(authData),
    });
    expect(viaAttestation).toEqual(key);
  });

  it("extracts an EdDSA (Ed25519) key", () => {
    const { publicKey } = ed25519.keygen();
    const cose = cborMap([
      [cborInt(1), cborInt(1)], // kty: OKP
      [cborInt(3), cborInt(-8)], // alg: EdDSA
      [cborInt(-1), cborInt(6)], // crv: Ed25519
      [cborInt(-2), cborBytes(publicKey)],
    ]);
    const key = extractCredentialPublicKey({
      publicKey: null,
      attestationObject: fabricateAttestationObject(fabricateAuthDataWithCose(cose)),
    });
    expect(key.curve).toBe("ed25519");
    expect(key.bytes).toEqual(publicKey);
  });

  it("rejects unsupported COSE algorithms", () => {
    const cose = cborMap([
      [cborInt(1), cborInt(2)],
      [cborInt(3), cborInt(-257)], // RS256
    ]);
    expect(() => extractCosePublicKey(fabricateAuthDataWithCose(cose))).toThrow(
      /unsupported COSE key/,
    );
  });
});

describe("SPKI public key extraction", () => {
  it("parses a P-256 SubjectPublicKeyInfo", () => {
    const { secretKey } = p256.keygen();
    const uncompressed = p256.Point.fromBytes(p256.getPublicKey(secretKey)).toBytes(false);
    // 26-byte SPKI header for id-ecPublicKey / prime256v1
    const header = new Uint8Array([
      0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01,
      0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, 0x03, 0x42, 0x00,
    ]);
    const key = extractSpkiPublicKey(concatBytes(header, uncompressed));
    expect(key.curve).toBe("p256");
    expect(key.bytes).toEqual(p256.Point.fromBytes(uncompressed).toBytes(true));
  });

  it("parses an Ed25519 SubjectPublicKeyInfo", () => {
    const { publicKey } = ed25519.keygen();
    const header = new Uint8Array([
      0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
    ]);
    const key = extractSpkiPublicKey(concatBytes(header, publicKey));
    expect(key.curve).toBe("ed25519");
    expect(key.bytes).toEqual(publicKey);
  });
});

describe("ECDSA DER -> raw 64-byte low-S", () => {
  const ORDER = p256.Point.Fn.ORDER;

  it("converts and preserves an already-low-S signature", () => {
    const sig = new p256.Signature(123456789n, 987654321n);
    const raw = derToRawLowS(sig.toBytes("der"));
    expect(raw).toEqual(sig.toBytes("compact"));
    expect(raw.length).toBe(64);
  });

  it("normalizes a high-S signature", () => {
    const s = ORDER - 5n; // high S
    const sig = new p256.Signature(123456789n, s);
    const raw = derToRawLowS(sig.toBytes("der"));
    const expected = new p256.Signature(123456789n, 5n).toBytes("compact");
    expect(raw).toEqual(expected);
  });

  it("produces curve-prefixed base58 proof signatures", () => {
    const sig = new p256.Signature(42n, 43n);
    const str = signatureToString("p256", sig.toBytes("der"));
    expect(str.startsWith("p256:")).toBe(true);
    expect(base58.decode(str.slice(5))).toEqual(sig.toBytes("compact"));

    const edSig = new Uint8Array(64).fill(7);
    expect(signatureToString("ed25519", edSig)).toBe(`ed25519:${base58.encode(edSig)}`);
  });
});

describe("local assertion verification", () => {
  const clientDataJson = new TextEncoder().encode(
    '{"type":"webauthn.get","challenge":"AAAA","origin":"https://example.com"}',
  );
  const authenticatorData = new Uint8Array([
    ...new Uint8Array(32).fill(0x22),
    FLAGS_UP_UV,
    0, 0, 0, 0,
  ]);

  it("verifies a fabricated P-256 assertion (and rejects the wrong key)", () => {
    const { secretKey } = p256.keygen();
    const publicKey = p256.Point.fromBytes(p256.getPublicKey(secretKey)).toBytes(true);
    const signedBytes = assertionSignedBytes(authenticatorData, clientDataJson);
    // Browser authenticators return DER; prehash sha256 is the WebAuthn rule.
    const compact = p256.sign(signedBytes, secretKey, { prehash: true });
    const der = p256.Signature.fromBytes(compact, "compact").toBytes("der");

    const assertion = {
      signature: Array.from(der),
      authenticatorData: Array.from(authenticatorData),
      clientDataJSON: Array.from(clientDataJson),
    };
    expect(verifyAssertion({ curve: "p256", bytes: publicKey }, assertion)).toBe(true);

    const other = p256.keygen();
    const otherKey = p256.Point.fromBytes(p256.getPublicKey(other.secretKey)).toBytes(true);
    expect(verifyAssertion({ curve: "p256", bytes: otherKey }, assertion)).toBe(false);
  });

  it("verifies a high-S P-256 assertion after normalization", () => {
    const { secretKey } = p256.keygen();
    const publicKey = p256.Point.fromBytes(p256.getPublicKey(secretKey)).toBytes(true);
    const signedBytes = assertionSignedBytes(authenticatorData, clientDataJson);
    const compact = p256.sign(signedBytes, secretKey, { prehash: true, lowS: false });
    const sig = p256.Signature.fromBytes(compact, "compact");
    // Force high-S (some authenticators emit it).
    const ORDER = p256.Point.Fn.ORDER;
    const highS = sig.s * 2n > ORDER ? sig : new p256.Signature(sig.r, ORDER - sig.s);

    const assertion = {
      signature: Array.from(highS.toBytes("der")),
      authenticatorData: Array.from(authenticatorData),
      clientDataJSON: Array.from(clientDataJson),
    };
    expect(verifyAssertion({ curve: "p256", bytes: publicKey }, assertion)).toBe(true);
  });

  it("verifies a fabricated Ed25519 assertion (and rejects the wrong key)", () => {
    const { secretKey, publicKey } = ed25519.keygen();
    const signedBytes = assertionSignedBytes(authenticatorData, clientDataJson);
    const signature = ed25519.sign(signedBytes, secretKey);

    const assertion = {
      signature: Array.from(signature),
      authenticatorData: Array.from(authenticatorData),
      clientDataJSON: Array.from(clientDataJson),
    };
    expect(verifyAssertion({ curve: "ed25519", bytes: publicKey }, assertion)).toBe(true);

    const other = ed25519.keygen();
    expect(verifyAssertion({ curve: "ed25519", bytes: other.publicKey }, assertion)).toBe(false);
  });

  it("rejects garbage signatures without throwing", () => {
    const assertion = {
      signature: [1, 2, 3],
      authenticatorData: Array.from(authenticatorData),
      clientDataJSON: Array.from(clientDataJson),
    };
    const { secretKey } = p256.keygen();
    const publicKey = p256.Point.fromBytes(p256.getPublicKey(secretKey)).toBytes(true);
    expect(verifyAssertion({ curve: "p256", bytes: publicKey }, assertion)).toBe(false);
  });
});

describe("real mainnet P-256 passkey proof (webauthn/src/p256.rs verify_ok)", () => {
  // Public key, RequestMessage and the on-chain-accepted proof from the
  // wallet crate's `verify_ok` test: the challenge inside clientDataJSON is
  // base64url(msg.hash()) and the proof signature is the low-S raw `r||s`.
  const publicKey = hex.decode(
    "02c0cad83d84b6bf228366971ddcb1738b9af862c64446a9feea85964743a5b390",
  );
  const msgJson =
    '{"nonce":2845491008,"request":{"external":[{"actions":[{"action":"function_call","payload":{"args":"eyJyZXF1ZXN0Ijp7InBheWxvYWRfdjIiOnsiRWNkc2EiOiIwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwIn0sImRvbWFpbl9pZCI6MCwicGF0aCI6IiJ9fQ==","deposit":"1","function_name":"sign"}}],"receiver_id":"v1.signer"}]},"chain_id":"mainnet","signer_id":"0se5eba21e8f191e1880e453794bc551dfa50a3419","created_at":"2026-07-07T11:13:29Z","timeout_secs":3600}';
  const proof = {
    authenticator_data: "SZYN5YgOjGh0NBcPZHZgW4_krrmihjLHmVzzuoMdl2MdAAAAAA==",
    client_data_json:
      '{"type":"webauthn.get","challenge":"fIVgtROAVRZ2pU2sSdzB4AmvMCBVbN6OHiFyeC_9Z3U","origin":"http://localhost:5173","crossOrigin":false}',
    signature: "p256:2S9WKwvKY7zgLaC9ihYDMQmbGtCvqqYy6RvvpgqRs7VXBR3GKXke4LKLNKyvtWRRB3dmU3awuCh2EYY7Sfk34qmh",
  };
  // The Rust vector pads its base64url; strip for the unpadded decoder.
  const authenticatorData = base64urlnopad.decode(proof.authenticator_data.replace(/=+$/, ""));
  const clientDataJSON = new TextEncoder().encode(proof.client_data_json);
  const rawSig = base58.decode(proof.signature.slice("p256:".length));
  // Browsers hand out DER; rebuild it from the raw vector.
  const der = p256.Signature.fromBytes(rawSig, "compact").toBytes("der");
  const assertion = {
    rawId: [] as number[],
    signature: Array.from(der),
    authenticatorData: Array.from(authenticatorData),
    clientDataJSON: Array.from(clientDataJSON),
  };

  it("challenge is base64url(RequestMessage hash)", () => {
    const hash = requestMessageHash(JSON.parse(msgJson));
    const challenge = (JSON.parse(proof.client_data_json) as { challenge: string }).challenge;
    expect(base64urlnopad.encode(hash)).toBe(challenge);
  });

  it("verifies locally against the credential key", () => {
    expect(verifyAssertion({ curve: "p256", bytes: publicKey }, assertion)).toBe(true);
  });

  it("buildProof reproduces the on-chain proof", () => {
    const built = JSON.parse(buildProof("p256", assertion)) as typeof proof;
    // Same bytes; this executor emits the unpadded form the contract declares.
    expect(built.authenticator_data).toBe(proof.authenticator_data.replace(/=+$/, ""));
    expect(base64urlnopad.decode(built.authenticator_data)).toEqual(authenticatorData);
    expect(built.client_data_json).toBe(proof.client_data_json);
    expect(built.signature).toBe(proof.signature);
  });
});

describe("authenticator user-verification flag", () => {
  function authData(flags: number): Uint8Array {
    return new Uint8Array([...new Uint8Array(32).fill(0x22), flags, 0, 0, 0, 0]);
  }

  it("accepts UP+UV set", () => {
    expect(authenticatorUserVerified(authData(FLAGS_UP_UV))).toBe(true);
  });

  it("rejects user-presence only (UV clear)", () => {
    expect(authenticatorUserVerified(authData(0b0000_0001))).toBe(false);
  });

  it("rejects UV set without UP", () => {
    expect(authenticatorUserVerified(authData(0b0000_0100))).toBe(false);
  });
});

describe("CBOR decoder: tags and simple values", () => {
  it("unwraps a semantic tag (major 6)", () => {
    // tag(2) wrapping byte-string 0x01 0x02 -> [0xc2, 0x42, 0x01, 0x02]
    const decoded = decodeCbor(new Uint8Array([0xc2, 0x42, 0x01, 0x02]));
    expect(decoded).toEqual(new Uint8Array([0x01, 0x02]));
  });

  it("decodes simple values inside a map (false/true/null)", () => {
    // {"a": true, "b": false, "c": null}
    const bytes = new Uint8Array([
      0xa3,
      0x61, 0x61, 0xf5, // "a": true
      0x61, 0x62, 0xf4, // "b": false
      0x61, 0x63, 0xf6, // "c": null
    ]);
    const map = decodeCbor(bytes) as Map<string, unknown>;
    expect(map.get("a")).toBe(true);
    expect(map.get("b")).toBe(false);
    expect(map.get("c")).toBe(0);
  });

  it("skips a float and keeps decoding the next key", () => {
    // {"x": 1.5 (half-float 0xf9 0x3e00), "y": 7}
    const bytes = new Uint8Array([
      0xa2,
      0x61, 0x78, 0xf9, 0x3e, 0x00, // "x": half-float 1.5
      0x61, 0x79, 0x07, // "y": 7
    ]);
    const map = decodeCbor(bytes) as Map<string, unknown>;
    expect(map.get("y")).toBe(7);
  });
});

describe("friendly WebAuthn errors", () => {
  const named = (name: string): Error => Object.assign(new Error("raw jargon"), { name });

  it("maps cancellation without blaming hardware", () => {
    const msg = friendlyWebauthnError(named("NotAllowedError"), "get");
    expect(msg).toMatch(/cancelled or timed out/i);
    expect(msg).not.toMatch(/raw jargon/);
  });

  it("routes a duplicate passkey to sign-in", () => {
    expect(friendlyWebauthnError(named("InvalidStateError"), "create")).toMatch(
      /already have an account.*sign in/i,
    );
  });

  it("explains a missing PIN / screen lock", () => {
    expect(friendlyWebauthnError(named("ConstraintError"), "create")).toMatch(
      /PIN, fingerprint, or face unlock/i,
    );
  });

  it("falls back to a safe generic message", () => {
    expect(friendlyWebauthnError(named("WeirdUnknownError"), "get")).toMatch(
      /something went wrong/i,
    );
  });
});
