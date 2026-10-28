module.exports = {
  preset: '@react-native/jest-preset',
  testTimeout: 15000,
  moduleNameMapper: {
    '^react-native-tcp-socket$':
      '<rootDir>/__mocks__/react-native-tcp-socket.js',
    '^react-native-zeroconf$': '<rootDir>/__mocks__/react-native-zeroconf.js',
    '^react-native-webrtc$': '<rootDir>/__mocks__/react-native-webrtc.js',
  },
};
