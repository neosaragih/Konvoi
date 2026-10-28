/* eslint-disable no-bitwise -- constant-time comparison needs XOR */
/**
 * Constant-time comparison for short secrets such as room PINs.
 *
 * Length is not hidden, but the compared content is. PINs are fixed-length
 * digits, so the early length check leaks nothing useful.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
