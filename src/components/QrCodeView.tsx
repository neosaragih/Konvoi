import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { generateQrMatrix } from '../utils/qrCode';

interface QrCodeViewProps {
  value: string;
  size?: number;
}

export function QrCodeView({ value, size = 200 }: QrCodeViewProps) {
  const matrix = useMemo(() => generateQrMatrix(value), [value]);
  const matrixSize = matrix.length;
  const cellSize = size / matrixSize;

  return (
    <View style={[styles.container, { width: size + 24, height: size + 24 }]}>
      <View style={{ width: size, height: size }}>
        {matrix.map((row, r) => (
          <View key={`r-${r}`} style={styles.row}>
            {row.map((cell, c) => (
              <View
                key={`c-${c}`}
                style={[
                  styles.cell,
                  { width: cellSize, height: cellSize },
                  cell ? styles.blackCell : styles.whiteCell,
                ]}
              />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    padding: 12,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
    alignSelf: 'center',
  },
  row: {
    flexDirection: 'row',
  },
  cell: {},
  blackCell: {
    backgroundColor: '#000000',
  },
  whiteCell: {
    backgroundColor: '#ffffff',
  },
});
