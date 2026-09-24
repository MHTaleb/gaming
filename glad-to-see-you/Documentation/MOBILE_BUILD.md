# MOBILE_BUILD.md — Android first, iOS-compatible

## Android player settings (already scripted: `Editor/MobileBuild.cs`, menu `Glad to See You ▸ Build`)

| Setting | Value | Why |
| --- | --- | --- |
| Package name | `com.mhtaleb.gladtoseeyou` | Play Store identity (change before first upload if owner prefers) |
| Scripting backend | **IL2CPP** | required for Play 64-bit + perf |
| Target architectures | **ARM64 only** (slice), ARMv7 as an option later | Play requirement is 64-bit; keep APK small |
| Graphics APIs | **Vulkan first, OpenGLES3 fallback** | modern devices perform best on Vulkan |
| Minimum API level | 26 (Android 8.0) | covers ~97% devices; Vulkan devices subset guarded by fallback |
| Target API level | latest installed | Play policy |
| Orientation | Landscape Left | action game, matches arena camera |
| Resolution scaling | via URP render scale per quality profile | one lever for all devices |
| Managed stripping | High (+ link XML if needed) | APK size |
| Texture compression | ASTC (fallback ETC2) | modern default |
| Splash | Unity default for now | replace when branding exists |
| Development builds | Script debugging off in releases, on in dev | |

## Signing (keystores are secrets)

- Create a keystore **locally**, never in the repo:
  ```bash
  keytool -genkeypair -v -keystore ~/keys/glad-release.keystore -alias glad -keyalg RSA -keysize 2048 -validity 9125
  ```
- Reference it in `ProjectSettings` manually (Player Settings ▸ Publishing) or via CLI env vars:
  `UNITY_ANDROID_KEYSTORE_PATH/_PASS/_ALIAS/_PASS` — **never committed**; `.gitignore` already blocks `*.keystore/*.jks`.
- Document the keystore location + password in your own password manager. Losing it loses update rights.

## Build from CLI (CI-friendly)

```bash
export PATH="$HOME/.local/bin:$PATH"
~/Unity/Hub/Editor/6000.3.24f1/Editor/Unity \
  -batchmode -quit \
  -projectPath /home/housseyn/workspace/gaming/glad-to-see-you \
  -executeMethod GladToSeeYou.EditorTools.MobileBuild.BuildAndroid \
  -logFile /tmp/android-build.log
```
The method honors env vars for keystore/signing and fails loudly on missing Android modules.

## On-device profiling

1. Development build + `Autoconnect Profiler`; USB debugging enabled.
2. `adb logcat -s Unity` for runtime logs; watch for GC spikes during combat.
3. Measure against `Documentation/PERFORMANCE_BUDGET.md` (frame time, draw calls, tris, memory).
4. Record a note in the PR: device model, profile, observed numbers.

## iOS (architecture-compatible, not built yet)

- No iOS-specific code paths; avoid platform `#if` in gameplay (only in build tooling).
- Metal considerations: none in current systems (URP handles it).
- Same LODs/textures/quality profiles apply. Require a Mac + Apple dev account when the time comes.

## Release checklist (future)

- [ ] Keystore created + backed up (owner)
- [ ] Version bumped (`PlayerSettings.bundleVersion`, derived versionCode)
- [ ] Privacy policy + Data safety form (nothing to declare yet: no network, no analytics)
- [ ] Store listing assets (icon, feature graphic, screenshots) — none required until release
