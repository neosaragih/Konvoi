import { generateQrMatrix } from '../qrCode';

const SAMPLE_PAYLOAD =
  'konvoi://join?host=192.168.43.1&port=41234&pin=123456' +
  '&room=room-abc12345&name=Konvoi%20Bromo';

describe('generateQrMatrix', () => {
  it('produces a square matrix that auto-sizes to the payload', () => {
    const matrix = generateQrMatrix(SAMPLE_PAYLOAD);

    expect(matrix.length).toBeGreaterThanOrEqual(25);
    for (const row of matrix) {
      expect(row).toHaveLength(matrix.length);
    }
  });

  it('draws the three finder patterns a real scanner expects', () => {
    const matrix = generateQrMatrix(SAMPLE_PAYLOAD);
    const size = matrix.length;
    const corners: Array<[number, number]> = [
      [0, 0],
      [0, size - 7],
      [size - 7, 0],
    ];

    for (const [row, col] of corners) {
      // Finder pattern border ring is dark at the pattern edge.
      expect(matrix[row][col]).toBe(true);
      expect(matrix[row + 6][col]).toBe(true);
      expect(matrix[row][col + 6]).toBe(true);
      // The center 3x3 block is dark.
      expect(matrix[row + 3][col + 3]).toBe(true);
    }
  });

  it('alternates the timing pattern between the finders', () => {
    const matrix = generateQrMatrix(SAMPLE_PAYLOAD);
    const size = matrix.length;

    for (let col = 8; col < size - 8; col++) {
      expect(matrix[6][col]).toBe(col % 2 === 0);
      expect(matrix[col][6]).toBe(col % 2 === 0);
    }
  });

  it('encodes different payloads into different matrices', () => {
    const a = generateQrMatrix(SAMPLE_PAYLOAD);
    const b = generateQrMatrix(SAMPLE_PAYLOAD.replace('123456', '654321'));

    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it('rejects an empty payload', () => {
    expect(() => generateQrMatrix('')).toThrow();
  });
});
