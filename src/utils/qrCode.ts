import qrcode from 'qrcode-generator';

/**
 * Real QR Code matrix (Byte mode, EC level M) via qrcode-generator.
 * The matrix auto-sizes to the payload and includes proper format and
 * Reed-Solomon error correction, so standard scanners can decode it.
 * Works fully offline — the encoder is bundled JS.
 */
export function generateQrMatrix(text: string): boolean[][] {
  if (text.length === 0) {
    throw new Error('QR payload must not be empty');
  }

  const qr = qrcode(0, 'M');
  qr.addData(text, 'Byte');
  qr.make();

  const size = qr.getModuleCount();
  const matrix: boolean[][] = [];
  for (let row = 0; row < size; row++) {
    const line: boolean[] = [];
    for (let col = 0; col < size; col++) {
      line.push(qr.isDark(row, col));
    }
    matrix.push(line);
  }
  return matrix;
}
