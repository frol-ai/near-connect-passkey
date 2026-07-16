/** Minimal borsh writer (little-endian, u32 length prefixes). */
export class BorshWriter {
  private chunks: number[] = [];

  writeU8(value: number): this {
    this.chunks.push(value & 0xff);
    return this;
  }

  writeBool(value: boolean): this {
    return this.writeU8(value ? 1 : 0);
  }

  writeU16(value: number): this {
    this.chunks.push(value & 0xff, (value >>> 8) & 0xff);
    return this;
  }

  writeU32(value: number): this {
    this.chunks.push(
      value & 0xff,
      (value >>> 8) & 0xff,
      (value >>> 16) & 0xff,
      (value >>> 24) & 0xff,
    );
    return this;
  }

  writeU64(value: bigint): this {
    let v = BigInt.asUintN(64, value);
    for (let i = 0; i < 8; i++) {
      this.chunks.push(Number(v & 0xffn));
      v >>= 8n;
    }
    return this;
  }

  writeU128(value: bigint): this {
    let v = BigInt.asUintN(128, value);
    for (let i = 0; i < 16; i++) {
      this.chunks.push(Number(v & 0xffn));
      v >>= 8n;
    }
    return this;
  }

  writeString(value: string): this {
    return this.writeBytes(new TextEncoder().encode(value));
  }

  /** Vec<u8>: u32 length prefix + raw bytes. */
  writeBytes(value: Uint8Array | readonly number[]): this {
    this.writeU32(value.length);
    return this.writeFixedBytes(value);
  }

  /** [u8; N] / pre-serialized payload: raw bytes, no prefix. */
  writeFixedBytes(value: Uint8Array | readonly number[]): this {
    for (const b of value) this.chunks.push(b & 0xff);
    return this;
  }

  writeOption<T>(value: T | null | undefined, write: (value: T) => void): this {
    if (value == null) {
      this.writeU8(0);
    } else {
      this.writeU8(1);
      write(value);
    }
    return this;
  }

  writeVec<T>(items: readonly T[], write: (item: T) => void): this {
    this.writeU32(items.length);
    for (const item of items) write(item);
    return this;
  }

  toBytes(): Uint8Array {
    return new Uint8Array(this.chunks);
  }
}

export function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

/** Bytewise lexicographic comparison (BTreeMap<Vec<u8>, _> key order). */
export function compareBytes(a: Uint8Array, b: Uint8Array): number {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = a[i] as number;
    const bv = b[i] as number;
    if (av !== bv) return av - bv;
  }
  return a.length - b.length;
}
