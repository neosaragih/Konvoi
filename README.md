# Konvoi

Voice-first room app for convoys, riding groups, and events on the same local
network. One phone hosts the room, everyone else joins over Wi-Fi or a phone
hotspot. Voice is peer-to-peer WebRTC; the host relays only signaling and
location. There is **no text chat** and **no internet dependency**.

Indonesian UI. Android and iOS.

## Current status

| Area                                                       | State                                                     |
| ---------------------------------------------------------- | --------------------------------------------------------- |
| Protocol (NDJSON v1), validators, host room engine         | Implemented, unit-tested                                  |
| TCP host server + guest client (`react-native-tcp-socket`) | Implemented, **not device-tested**                        |
| mDNS discovery + advertising (`react-native-zeroconf`)     | Implemented, **not device-tested**                        |
| App screens, navigation, room lifecycle                    | Implemented                                               |
| WebRTC audio mesh (`react-native-webrtc`)                  | Implemented, **not device-tested**; mic is opt-in         |
| GPS + live location                                        | **Not implemented** — protocol and host relay are ready   |
| Offline MapLibre map pack                                  | **Not implemented** — no online fallback                  |
| Native builds                                              | GitHub Actions green: Checks, Android APKs, iOS simulator |

Unit tests and CI builds are not device validation. mDNS, TCP reachability,
client isolation, GPS, Bluetooth routing, WebRTC media, and offline map
behavior still need at least two physical phones on a network with no WAN.

## Requirements

- Both phones on the same Wi-Fi network or phone hotspot.
- Android or iOS build of Konvoi on every phone.
- For manual joining: the host's LAN IP, the port shown in the app, and the
  6-digit PIN.
- The host keeps the app open in the foreground. Background hosting, background
  audio, and background location are out of scope for release 1.

## Build

Native toolchains are not required on the development machine; builds run on
GitHub Actions:

- `.github/workflows/android.yml` — builds `assembleDebug` and
  `assembleRelease` on Ubuntu + JDK 17 + Android SDK. Uploads two artifacts:
  - `konvoi-debug-apk`: debug build that needs Metro running.
  - `konvoi-dev-apk`: standalone development build with the JS bundle
    included, signed with the checked-in debug keystore. **Not production
    signed; do not publish it.**
- `.github/workflows/ios.yml` — unsigned simulator build, uploads
  `konvoi-ios-simulator`.
- `.github/workflows/ci.yml` — lint, typecheck, Jest.

The latest green **Android development APK** run is in the repository's Actions
tab; download the `konvoi-dev-apk` artifact and install it on a phone. It has
the JS bundle inside, so it does not need Metro.

No release signing is configured. Android release builds need a keystore; iOS
device/release builds need Apple certificates and provisioning profiles. Keep
those in GitHub Secrets, never in the repository.

Local checks (Node 24 / npm 11):

```sh
npm ci
npm run lint
npx tsc --noEmit
npm test
```

Run one suite or one case:

```sh
npm test -- src/features/room/__tests__/roomEngine.test.ts
npm test -- src/features/room/__tests__/roomEngine.test.ts -t "relays a signal"
```

## Trying a room

1. Install the same build on two phones and connect both to the same Wi-Fi or
   hotspot.
2. Phone A: **Buat Ruangan**, enter a display name and room name. The host
   screen shows the PIN, port, and instructions for finding the phone's IP.
3. Phone B: **Gabung Ruangan**. If the room appears under “Ruangan di sekitar”,
   select it and type the PIN. Otherwise type the host IP, port, and PIN
   manually. Manual joining always works and does not depend on mDNS.
4. The room screen shows the participant list. Press **Mulai Suara** to open
   the microphone and connect to the other voice participants. Voice is wired
   but not yet verified on physical devices; GPS and map controls remain
   disabled and labeled **Belum tersedia**.

The host IP is read from the phone's Wi-Fi settings for now; the app does not
yet auto-detect its own LAN address. Common hotspot defaults are
`192.168.43.1` (Android) and `172.20.10.1` (iPhone), but always confirm in
system settings.

## Repository layout

```
App.tsx                         screen switch + Android back handling
src/protocol/                   message types, validators, NDJSON serialization
src/networking/                 framer, TCP adapter, sessions, mDNS discovery
src/features/room/              host engine, guest reducer, room sessions
src/voice/                      WebRTC audio mesh + deterministic offer/answer planning
src/state/useRoomApp.ts         app controller (sessions, discovery, navigation)
src/screens/                    Beranda, Buat, Host, Gabung, Ruang Suara, Peta, Pengaturan
src/components/                 shared UI primitives
docs/SPEC.md                    authoritative product/technical requirements
docs/NETWORKING.md              transport, discovery, permissions, troubleshooting
docs/VOICE_AND_BLUETOOTH.md     audio mesh, mic lifecycle, Bluetooth limits
```

## Limits and honesty

- **No internet at runtime.** No cloud signaling, analytics, remote fonts, CDN
  assets, or remote map tiles.
- **No encryption claims.** The PIN gates joining only. Signaling and location
  are plaintext on the LAN. Do not use Konvoi on a network you do not trust.
- **No STUN/TURN.** Voice uses `iceServers: []`; if ICE fails, the app must show
  a LAN/client-isolation error rather than route around it.
- **No chat.** There is no message type, composer, or history.
- **Foreground only.** No background audio, location, or reliable background
  hosting.
- **Bluetooth** uses the OS-managed HFP/HSP route. Pair in system settings.
  Output-only A2DP devices cannot provide a microphone.
- **PINs, coordinates, and audio are never logged or persisted.**

See [`docs/SPEC.md`](docs/SPEC.md) for the full requirements and
[`docs/NETWORKING.md`](docs/NETWORKING.md) for the transport details.
