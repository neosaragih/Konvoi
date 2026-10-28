/**
 * Test-time stand-in for the native TCP module.
 *
 * The real adapter is only exercised on a device. Unit tests must not load
 * native code; if a test reaches these functions it should fail loudly rather
 * than silently pretend a socket exists.
 */
function unavailable(name: string): never {
  throw new Error(`react-native-tcp-socket ${name} is unavailable in Jest`);
}

module.exports = {
  createServer: () => unavailable('createServer'),
  createConnection: () => unavailable('createConnection'),
  default: {
    createServer: () => unavailable('createServer'),
    createConnection: () => unavailable('createConnection'),
  },
};
