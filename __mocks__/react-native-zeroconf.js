/**
 * Test-time stand-in for the native Zeroconf module.
 *
 * Discovery is exercised on physical devices only. Tests must not load the
 * native module; the mock keeps imports safe and makes accidental use obvious.
 */
class Zeroconf {
  on() {
    return this;
  }

  removeAllListeners() {}

  removeDeviceListeners() {}

  checkLocalNetworkAccess() {
    return Promise.resolve('granted');
  }

  scan() {}

  stop() {}

  publishService() {
    return Promise.reject(new Error('Zeroconf is unavailable in Jest'));
  }

  unpublishService() {
    return Promise.resolve(null);
  }
}

module.exports = { __esModule: true, default: Zeroconf };
