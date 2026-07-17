import { ed25519 } from "@noble/curves/ed25519.js";
import { p256 } from "@noble/curves/nist.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { base58, base64urlnopad } from "@scure/base";

import { concatBytes } from "./borsh";
import type { PasskeyPublicKey } from "./stateInit";
import type { PasskeyCurve, WebauthnGetResult } from "./types";

// ─── Minimal CBOR decoder (enough for WebAuthn attestation objects) ─────────

type CborValue = number | bigint | boolean | Uint8Array | string | CborValue[] | CborMap;
type CborMap = Map<number | string, CborValue>;

function readLength(bytes: Uint8Array, offset: number, info: number): [number, number] {
  if (info < 24) return [info, offset];
  if (info === 24) return [at(bytes, offset), offset + 1];
  if (info === 25) return [(at(bytes, offset) << 8) | at(bytes, offset + 1), offset + 2];
  if (info === 26) {
    return [
      at(bytes, offset) * 0x1000000 +
        ((at(bytes, offset + 1) << 16) | (at(bytes, offset + 2) << 8) | at(bytes, offset + 3)),
      offset + 4,
    ];
  }
  throw new Error("CBOR: unsupported length encoding");
}

function at(bytes: Uint8Array, offset: number): number {
  const b = bytes[offset];
  if (b === undefined) throw new Error("CBOR: unexpected end of input");
  return b;
}

function decodeItem(bytes: Uint8Array, offset: number): [CborValue, number] {
  const initial = at(bytes, offset);
  const major = initial >> 5;
  const info = initial & 0x1f;
  offset += 1;

  switch (major) {
    case 0: {
      const [value, next] = readLength(bytes, offset, info);
      return [value, next];
    }
    case 1: {
      const [value, next] = readLength(bytes, offset, info);
      return [-1 - value, next];
    }
    case 2: {
      const [len, next] = readLength(bytes, offset, info);
      return [bytes.slice(next, next + len), next + len];
    }
    case 3: {
      const [len, next] = readLength(bytes, offset, info);
      return [new TextDecoder().decode(bytes.slice(next, next + len)), next + len];
    }
    case 4: {
      const [len, next] = readLength(bytes, offset, info);
      const items: CborValue[] = [];
      let cursor = next;
      for (let i = 0; i < len; i++) {
        const [item, after] = decodeItem(bytes, cursor);
        items.push(item);
        cursor = after;
      }
      return [items, cursor];
    }
    case 5: {
      const [len, next] = readLength(bytes, offset, info);
      const map: CborMap = new Map();
      let cursor = next;
      for (let i = 0; i < len; i++) {
        const [key, afterKey] = decodeItem(bytes, cursor);
        const [value, afterValue] = decodeItem(bytes, afterKey);
        if (typeof key !== "number" && typeof key !== "string") {
          throw new Error("CBOR: unsupported map key type");
        }
        map.set(key, value);
        cursor = afterValue;
      }
      return [map, cursor];
    }
    case 6: {
      // Semantic tag: read (and discard) the tag number, return the tagged
      // item. Some authenticators wrap attestation-statement values in tags.
      const [, next] = readLength(bytes, offset, info);
      return decodeItem(bytes, next);
    }
    case 7: {
      // Simple values (false/true/null/undefined) and floats. We only ever
      // need the simple values; consume floats so decoding doesn't derail.
      if (info < 20) return [info, offset]; // simple value in the type byte
      if (info === 20) return [false, offset];
      if (info === 21) return [true, offset];
      if (info === 22 || info === 23) return [0, offset]; // null / undefined
      if (info === 24) return [at(bytes, offset), offset + 1]; // simple, 1 byte
      if (info === 25) return [0, offset + 2]; // half-float: skip 2 bytes
      if (info === 26) return [0, offset + 4]; // single-float: skip 4 bytes
      if (info === 27) return [0, offset + 8]; // double-float: skip 8 bytes
      throw new Error("CBOR: unsupported simple/float value");
    }
    default:
      throw new Error(`CBOR: unsupported major type ${major}`);
  }
}

// ─── Authenticator-data flags ────────────────────────────────────────────────

const FLAG_USER_PRESENT = 0x01;
const FLAG_USER_VERIFIED = 0x04;

/**
 * WebAuthn authenticatorData layout: rpIdHash(32) then a 1-byte flags field.
 * The UV bit is set only when the authenticator actually verified the user
 * (biometric / PIN / screen lock) rather than mere presence (a bare touch).
 */
export function authenticatorUserVerified(authenticatorData: Uint8Array): boolean {
  const flags = at(authenticatorData, 32);
  return (flags & FLAG_USER_PRESENT) !== 0 && (flags & FLAG_USER_VERIFIED) !== 0;
}

export function decodeCbor(bytes: Uint8Array): CborValue {
  return decodeItem(bytes, 0)[0];
}

// ─── COSE / SPKI public key extraction ───────────────────────────────────────

function compressP256Uncompressed(uncompressed: Uint8Array): Uint8Array {
  return p256.Point.fromBytes(uncompressed).toBytes(true);
}

/** Extract a public key from the COSE key embedded in attestation authData. */
export function extractCosePublicKey(authData: Uint8Array): PasskeyPublicKey {
  const flags = at(authData, 32);
  if ((flags & 0x40) === 0) {
    throw new Error("WebAuthn: attested credential data flag (AT) not set");
  }
  // rpIdHash(32) + flags(1) + signCount(4) + aaguid(16) + credIdLen(2 BE)
  const credIdLen = (at(authData, 53) << 8) | at(authData, 54);
  const coseStart = 55 + credIdLen;
  const cose = decodeItem(authData, coseStart)[0];
  if (!(cose instanceof Map)) throw new Error("WebAuthn: COSE key is not a map");

  const kty = cose.get(1);
  const alg = cose.get(3);
  if (kty === 2 && alg === -7) {
    // EC2 / ES256 (P-256)
    if (cose.get(-1) !== 1) throw new Error("WebAuthn: unsupported EC2 curve");
    const x = cose.get(-2);
    const y = cose.get(-3);
    if (!(x instanceof Uint8Array) || !(y instanceof Uint8Array)) {
      throw new Error("WebAuthn: malformed EC2 COSE key");
    }
    const uncompressed = concatBytes(new Uint8Array([0x04]), x, y);
    return { curve: "p256", bytes: compressP256Uncompressed(uncompressed) };
  }
  if (kty === 1 && alg === -8) {
    // OKP / EdDSA (Ed25519)
    if (cose.get(-1) !== 6) throw new Error("WebAuthn: unsupported OKP curve");
    const x = cose.get(-2);
    if (!(x instanceof Uint8Array) || x.length !== 32) {
      throw new Error("WebAuthn: malformed OKP COSE key");
    }
    return { curve: "ed25519", bytes: x };
  }
  throw new Error(`WebAuthn: unsupported COSE key (kty=${String(kty)}, alg=${String(alg)})`);
}

const ED25519_SPKI_PREFIX = new Uint8Array([
  0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
]);

/** Extract a public key from a SubjectPublicKeyInfo blob (`getPublicKey()`). */
export function extractSpkiPublicKey(spki: Uint8Array): PasskeyPublicKey {
  // Ed25519 SPKI: fixed 12-byte header + 32-byte key
  if (
    spki.length === 44 &&
    ED25519_SPKI_PREFIX.every((byte, index) => spki[index] === byte)
  ) {
    return { curve: "ed25519", bytes: spki.slice(12) };
  }
  // P-256 SPKI: 26-byte header + 65-byte uncompressed point
  if (spki.length === 91 && spki[26] === 0x04) {
    return { curve: "p256", bytes: compressP256Uncompressed(spki.slice(26)) };
  }
  if (spki.length === 65 && spki[0] === 0x04) {
    return { curve: "p256", bytes: compressP256Uncompressed(spki) };
  }
  throw new Error(`WebAuthn: unsupported SPKI public key (${spki.length} bytes)`);
}

/** Prefer the bridge-proxied `getPublicKey()` SPKI, fall back to COSE parsing. */
export function extractCredentialPublicKey(result: {
  publicKey?: number[] | null;
  attestationObject: number[];
}): PasskeyPublicKey {
  if (result.publicKey && result.publicKey.length > 0) {
    try {
      return extractSpkiPublicKey(new Uint8Array(result.publicKey));
    } catch {
      // fall through to COSE
    }
  }
  const attestation = decodeCbor(new Uint8Array(result.attestationObject));
  if (!(attestation instanceof Map)) {
    throw new Error("WebAuthn: malformed attestation object");
  }
  const authData = attestation.get("authData");
  if (!(authData instanceof Uint8Array)) {
    throw new Error("WebAuthn: attestation object has no authData");
  }
  return extractCosePublicKey(authData);
}

// ─── ECDSA DER -> raw 64-byte low-S ──────────────────────────────────────────

const P256_ORDER = p256.Point.Fn.ORDER;

/** Parse a DER ECDSA signature and normalize to low-S raw `r || s` (64 bytes). */
export function derToRawLowS(der: Uint8Array): Uint8Array {
  const sig = p256.Signature.fromBytes(der, "der");
  const normalized = sig.s * 2n > P256_ORDER ? new p256.Signature(sig.r, P256_ORDER - sig.s) : sig;
  return normalized.toBytes("compact");
}

// ─── Assertion verification (client-side candidate disambiguation) ──────────

/** WebAuthn signs `authenticatorData || sha256(clientDataJSON)`. */
export function assertionSignedBytes(
  authenticatorData: Uint8Array,
  clientDataJson: Uint8Array,
): Uint8Array {
  return concatBytes(authenticatorData, sha256(clientDataJson));
}

/**
 * Verify an assertion signature against a candidate public key.
 * P-256: ECDSA over sha256(signedBytes), DER signature, low-S normalized.
 * Ed25519: EdDSA over raw signedBytes, 64-byte signature.
 */
export function verifyAssertion(
  publicKey: PasskeyPublicKey,
  assertion: { signature: number[]; authenticatorData: number[]; clientDataJSON: number[] },
): boolean {
  const signedBytes = assertionSignedBytes(
    new Uint8Array(assertion.authenticatorData),
    new Uint8Array(assertion.clientDataJSON),
  );
  try {
    if (publicKey.curve === "p256") {
      const raw = derToRawLowS(new Uint8Array(assertion.signature));
      // prehash: true (default) applies sha256 to the signed bytes.
      return p256.verify(raw, signedBytes, publicKey.bytes, { format: "compact" });
    }
    return ed25519.verify(new Uint8Array(assertion.signature), signedBytes, publicKey.bytes);
  } catch {
    return false;
  }
}

// ─── Wallet-contract proof blob ──────────────────────────────────────────────

/** Curve-prefixed signature string used inside proofs. */
export function signatureToString(curve: PasskeyCurve, signature: Uint8Array): string {
  if (curve === "p256") {
    return `p256:${base58.encode(derToRawLowS(signature))}`;
  }
  if (signature.length !== 64) throw new Error("WebAuthn: ed25519 signature must be 64 bytes");
  return `ed25519:${base58.encode(signature)}`;
}

/**
 * JSON proof accepted by `w_execute_signed` / `w_resolve_auth`:
 * `{"authenticator_data": base64url-unpadded, "client_data_json": string, "signature": "<curve>:<base58>"}`
 */
export function buildProof(curve: PasskeyCurve, assertion: WebauthnGetResult): string {
  return JSON.stringify({
    authenticator_data: base64urlnopad.encode(new Uint8Array(assertion.authenticatorData)),
    client_data_json: new TextDecoder().decode(new Uint8Array(assertion.clientDataJSON)),
    signature: signatureToString(curve, new Uint8Array(assertion.signature)),
  });
}

export function rawIdToB64(rawId: number[] | Uint8Array): string {
  return base64urlnopad.encode(
    rawId instanceof Uint8Array ? rawId : new Uint8Array(rawId),
  );
}

export function b64ToRawId(b64: string): number[] {
  return Array.from(base64urlnopad.decode(b64));
}
