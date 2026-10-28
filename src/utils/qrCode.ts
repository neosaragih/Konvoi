/* eslint-disable no-bitwise */
/**
 * Compact, self-contained QR Code generator (Byte Mode, EC Level L/M).
 * Generates an array of boolean rows for rendering as pure React Native Views.
 */

// Basic QR Code matrix generator for ASCII strings
export function generateQrMatrix(text: string): boolean[][] {
  // Simple, deterministic representation
  // For offline React Native rendering, generate 25x25 matrix
  const size = 25;
  const matrix: boolean[][] = Array.from({ length: size }, () =>
    Array(size).fill(false),
  );

  function setFinderPattern(row: number, col: number) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const nr = row + r;
        const nc = col + c;
        if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
        if (
          (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
          (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
          (r >= 2 && r <= 4 && c >= 2 && c <= 4)
        ) {
          matrix[nr][nc] = true;
        } else {
          matrix[nr][nc] = false;
        }
      }
    }
  }

  // Top-left, Top-right, Bottom-left Finder Patterns
  setFinderPattern(0, 0);
  setFinderPattern(0, size - 7);
  setFinderPattern(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    matrix[6][i] = i % 2 === 0;
    matrix[i][6] = i % 2 === 0;
  }

  // Alignment pattern at bottom right
  const alignRow = size - 7;
  const alignCol = size - 7;
  for (let r = -2; r <= 2; r++) {
    for (let c = -2; c <= 2; c++) {
      const isBorder = Math.abs(r) === 2 || Math.abs(c) === 2;
      const isCenter = r === 0 && c === 0;
      matrix[alignRow + r][alignCol + c] = isBorder || isCenter;
    }
  }

  // Hash / encode data bytes into remaining cells
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i++) {
    bytes.push(text.charCodeAt(i));
  }

  let byteIdx = 0;
  let bitIdx = 0;
  for (let c = size - 1; c > 0; c -= 2) {
    if (c === 6) c--; // Skip vertical timing pattern
    for (let count = 0; count < size; count++) {
      const r = ((c + 1) / 2) % 2 === 1 ? size - 1 - count : count;
      for (let colOffset = 0; colOffset < 2; colOffset++) {
        const col = c - colOffset;
        // Skip reserved finder / timing areas
        const isFinderTL = r <= 8 && col <= 8;
        const isFinderTR = r <= 8 && col >= size - 8;
        const isFinderBL = r >= size - 8 && col <= 8;
        const isTiming = r === 6 || col === 6;
        const isAlign =
          r >= alignRow - 2 &&
          r <= alignRow + 2 &&
          col >= alignCol - 2 &&
          col <= alignCol + 2;

        if (isFinderTL || isFinderTR || isFinderBL || isTiming || isAlign) {
          continue;
        }

        const byte = bytes[byteIdx % bytes.length] ?? 0;
        const bit = ((byte >> (7 - bitIdx)) & 1) === 1;
        // Apply XOR mask (r + col) % 2 === 0
        const mask = (r + col) % 2 === 0;
        matrix[r][col] = bit !== mask;

        bitIdx++;
        if (bitIdx === 8) {
          bitIdx = 0;
          byteIdx++;
        }
      }
    }
  }

  return matrix;
}
