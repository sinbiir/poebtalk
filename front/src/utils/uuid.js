import * as Crypto from 'expo-crypto';

export const uuid = () => {
  if (typeof Crypto.randomUUID === 'function') {
    return Crypto.randomUUID();
  }
  const bytes = Crypto.getRandomBytes(16);
  // RFC4122 variant 4
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const toHex = n => n.toString(16).padStart(2, '0');
  const hex = Array.from(bytes, toHex).join('');
  return (
    hex.substring(0, 8) +
    '-' +
    hex.substring(8, 12) +
    '-' +
    hex.substring(12, 16) +
    '-' +
    hex.substring(16, 20) +
    '-' +
    hex.substring(20)
  );
};