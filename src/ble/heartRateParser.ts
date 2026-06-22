const base64Chars =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function decodeBase64(value: string): Uint8Array {
  const cleanValue = value.replace(/=+$/, "");
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;

  for (const char of cleanValue) {
    const index = base64Chars.indexOf(char);

    if (index === -1) {
      throw new Error("Invalid base64 heart rate payload.");
    }

    buffer = (buffer << 6) | index;
    bits += 6;

    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }

  return Uint8Array.from(bytes);
}

export function parseHeartRateMeasurement(value: string): number {
  const bytes = decodeBase64(value);

  if (bytes.length < 2) {
    throw new Error("Heart rate payload is too short.");
  }

  const flags = bytes[0];
  const isUInt16 = (flags & 0x01) === 0x01;

  if (!isUInt16) {
    return bytes[1];
  }

  if (bytes.length < 3) {
    throw new Error("Heart rate uint16 payload is too short.");
  }

  return bytes[1] | (bytes[2] << 8);
}
