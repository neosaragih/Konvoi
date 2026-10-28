# AGENTS.md

Konvoi is a **voice-first** React Native app: the host phone runs a room server on the local Wi-Fi/hotspot, participants talk over a WebRTC audio mesh, and consenting participants share live positions on an offline map. **No text chat**, no internet at runtime.

**Read `docs/SPEC.md` before implementing.** It is the authoritative product/technical spec (screens, protocol, acceptance criteria) and is not auto-loaded. This file covers repo state, commands, and traps.

## Repo state (verified 2026-10-28)

- React Native **0.88.1** + TypeScript 6, package `Konvoi`, Android/iOS id `com.konvoi`, mDNS `_konvoi._tcp`.
- Implemented and unit-tested: NDJSON framing, typed protocol + validators, host room engine (membership, voice roster, signaling relay, location sharing), deterministic mesh peer planning, host/guest room sessions.
- Implemented but **device-unverified**: `react-native-tcp-socket` TCP adapter, `react-native-zeroconf` mDNS discovery/advertising, `react-native-webrtc` audio mesh, app controller, screens, and internal navigation.
- Not implemented: geolocation, MapLibre offline map pack, Bluetooth route UI. GPS/map controls are visibly disabled and labeled "Belum tersedia"; don't fake their status.
- Voice is wired but unproven until GitHub CI compiles `react-native-webrtc` and two physical phones pass audio on a WAN-less network. Don't claim voice works before that.
- Host local IP is not auto-detected: no local-IP module is installed. The host screen tells users to read it from Wi-Fi settings and lists common hotspot defaults. Manual IP/port/PIN is the supported fallback.
- `README.md`, `docs/NETWORKING.md`, and `docs/VOICE_AND_BLUETOOTH.md` describe the real project. `docs/MAPS_OFFLINE.md` is still to be written when the map lands.
- No git repo and `git` is not installed here. Don't run git commands or assume branches/diffs.
- Local machine: Node 24 / npm 11, but **no JDK 17, Android SDK, Xcode, or CocoaPods**. Native builds run in **GitHub Actions**; this box is for lint, typecheck, and Jest only.

## Commands

- `npm run lint`
- `npx tsc --noEmit`
- `npm test`
- one suite: `npm test -- src/features/room/__tests__/roomEngine.test.ts`
- one case: `npm test -- src/features/room/__tests__/roomEngine.test.ts -t "relays a signal"`
- Order before pushing: `lint` -> `tsc --noEmit` -> `jest`.

## Build pipeline (GitHub Actions)

- `.github/workflows/ci.yml` — `npm ci`, lint, typecheck, Jest on Ubuntu.
- `.github/workflows/android.yml` — Ubuntu + JDK 17 + Android SDK, `./gradlew :app:assembleDebug :app:assembleRelease`, uploads `konvoi-debug-apk` (needs Metro) and `konvoi-dev-apk` (bundled JS, debug-signed). The dev APK is not production-signed.
- `.github/workflows/ios.yml` — macOS + CocoaPods, unsigned simulator build, uploads `konvoi-ios-simulator`.
- Workflows are authored but **have not run yet** (no remote/commit). First push will be their first execution.
- No release signing is configured. Android release needs a keystore; iOS device/release builds need Apple certificates/profiles. Keep secrets in GitHub Secrets, never in the repo.
- CI proves compilation, not runtime behavior. If a native module breaks a build, fix it or document the blocker; don't delete/disable the workflow to get green.

## Architecture

- **Voice-first, no chat.** There is no chat message type, screen, composer, or history. Don't reintroduce one.
- **Host = server.** `src/features/room/roomEngine.ts` is a transport-agnostic state machine. It emits `send` / `disconnect` / `closed` events; the TCP adapter must apply them and skip `HOST_CONNECTION_ID` when writing sockets (that ID is the in-process host UI).
- **Wire format:** UTF-8 NDJSON in `src/networking/ndjsonFramer.ts`. Byte-level, per-connection buffer, max frame size, resync after oversized lines. A TCP chunk is not a message.
- **Protocol:** `src/protocol/{messageTypes,validators,protocolVersion}.ts`. Host assigns participant IDs and timestamps; clients never supply identity. Validate on both ends.
- **Voice mesh:** `src/voice/voiceSignaling.ts`. For each pair, the lexicographically smaller participant ID offers; the other answers. Signaling goes through the host's TCP room; media is P2P WebRTC with `iceServers: []`.
- **Installed native modules:** `react-native-tcp-socket` 6.4.3, `react-native-zeroconf` 0.17.6. **Planned:** `react-native-webrtc`, MapLibre, geolocation. Add one at a time, verify RN 0.88/New Architecture support, and let CI prove it compiles.
- **Tests:** `src/**/__tests__/*.test.ts`; protocol/engine tests must not import native modules.

## Traps

- **No runtime internet.** No cloud/hosted signaling, analytics, remote fonts/images, CDN assets, or remote map styles/tiles.
- **Don't add STUN/TURN** to make voice connect, not even a public Google server. If ICE fails, show a LAN/client-isolation error.
- **No E2E/encryption claims.** The PIN gates joining; signaling and location are plaintext on the LAN. Never write "secure", "private", or "encrypted" in UI/docs.
- **Mic is opt-in.** It starts only on explicit Start Voice, is visibly indicated, and must stop on Leave Voice, room leave/kick/close, or permission revocation. Voice cap 6, room cap 12.
- **Bluetooth = OS-managed HFP/HSP route.** Pairing happens in system settings. A2DP-only devices have no usable mic — explain that, never fake a route or claim universal intercom support.
- **Offline map must never fall back online.** Don't bulk-download `tile.openstreetmap.org`; missing coverage needs an explicit UI state; attribution is mandatory.
- **Wi-Fi Direct isn't cross-platform** (iOS has no Wi-Fi Direct API). Same-Wi-Fi + phone hotspot is the supported path.
- An invite link/QR can carry room ID + host IP/port, but cannot onboard a guest onto the Wi-Fi. Keep the PIN out of mDNS; manual IP+port+PIN stays required.
- **Never log or persist** PINs, coordinates, or audio. Locations are in-memory for the room only and cleared on stop/leave/kick/close.
- **Foreground only.** No background audio, background location, or reliable background hosting promises in release 1.

## Verification reality

- Unit tests and CI builds are not device validation. These require at least two physical phones on a WAN-less network: mDNS, TCP reachability, client isolation, GPS fix, Bluetooth routing, WebRTC media path, offline map in airplane mode, background transitions.
- Record device/OS/intercom models actually used; mark everything else "unverified". Never invent test results.

## Docs that must stay true

`docs/SPEC.md` (requirements), `docs/NETWORKING.md` (transport/discovery as implemented), and `README.md`. Add `docs/MAPS_OFFLINE.md` and `docs/VOICE_AND_BLUETOOTH.md` when those features land. If a library proves incompatible, stop, document the blocker and alternatives, and update the spec before changing architecture.
