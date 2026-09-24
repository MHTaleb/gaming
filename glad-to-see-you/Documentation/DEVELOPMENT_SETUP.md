# DEVELOPMENT_SETUP.md — environment, installs, verification

> Everything below was verified on the owner's machine (WSL2 Ubuntu 20.04, user `housseyn`) on 2026-09-24.
> Where something could not be verified, it is explicitly marked. Never trust a doc over a command.

## 0. Environment status (verified)

| Tool | Status | Location / Version |
| --- | --- | --- |
| Git | ✅ installed | 2.25.1 |
| Git LFS | ✅ installed (user-space, 2026-09-24) | `~/.local/bin/git-lfs` — **v3.8.0**, repo-local filters enabled |
| Node.js / npm | ✅ installed | Node v22.23.2 / npm 10.9.8 |
| Python (system) | ✅ installed | 3.8.10 (used only for scripting; MCP servers use `uv`) |
| `uv` / `uvx` | ✅ installed | `~/.local/bin/uv`, `~/.local/bin/uvx` |
| Java (JDK) | ✅ installed | OpenJDK 25 (system) |
| VS Code | ✅ installed | 1.138.0 |
| **Unity Editor 6.3 LTS** | ⚠️ **installed but cannot run on THIS distro** (verified 2026-09-24) | `~/Unity/Hub/Editor/6000.3.24f1/Editor/Unity` |
| **Blender 5.2.2** | ✅ installed + runs (user-space, 2026-09-24) | `~/apps/blender-5.2.2-linux-x64/`, symlink `~/.local/bin/blender` |
| Unity Hub | ❌ not installed | not required for CLI workflow; optional GUI convenience |
| Android SDK/NDK (for Unity) | ❌ not installed (not possible here — see §3) | install via Unity Hub on Windows |
| `.local/bin` on PATH | ❌ not by default | scripts export it; add to your shell rc yourself if you want it globally |

**VERIFIED environment blocker (2026-09-24):** the Unity 6.3 Linux binary requires `GLIBC_2.32/2.33/2.34`;
this WSL distro is Ubuntu **20.04 / glibc 2.31** → the editor **fails to start here** (confirmed by direct
execution). Unity does not support Ubuntu 20.04 for the Unity 6 Linux editor. The project files are fully
prepared; **run the editor from one of these instead**:

1. **Windows host (recommended):** install Unity Hub + Unity 6000.3.24f1 + Android modules on Windows,
   open the project via `\\wsl.localhost\Ubuntu\home\housseyn\workspace\gaming\glad-to-see-you`
   (first `Library/` build is slow over the 9P mount; acceptable, or clone to a Windows drive for editor work).
2. **Or upgrade the WSL distro** to Ubuntu 22.04/24.04 (`sudo do-release-upgrade`), then the installed
   editor becomes runnable in WSLg: `~/Unity/Hub/Editor/6000.3.24f1/Editor/Unity -projectPath ...`.

Everything below marked ✅ was executed and verified on this machine; the editor install steps were
completed too (files verified) — only *running* the editor is blocked by glibc.

## 1. Why user-space installs

This machine has **no passwordless sudo**. Everything is installed under `~` (no system changes):
`~/.local/bin` for binaries, `~/apps` for apps, `~/Unity` for the editor. Scripts are idempotent and
detect-before-install.

## 2. Reproduce the installs (already done — for rebuilds/other machines)

```bash
# Git LFS (user-space)
LATEST=$(curl -s https://api.github.com/repos/git-lfs/git-lfs/releases/latest | grep -m1 '"tag_name"' | cut -d'"' -f4)
curl -sL "https://github.com/git-lfs/git-lfs/releases/download/$LATEST/git-lfs-linux-amd64-$LATEST.tar.gz" | tar xz -C /tmp
cp /tmp/git-lfs-*/git-lfs ~/.local/bin/ && chmod +x ~/.local/bin/git-lfs

# Unity editor 6000.3.24f1 (Linux tarball, changeset 4e7b9b5b6244)
mkdir -p ~/Unity/Hub/Editor/6000.3.24f1
curl -L -o ~/Unity/downloads/Unity-6000.3.24f1.tar.xz \
  'https://download.unity3d.com/download_unity/4e7b9b5b6244/LinuxEditorInstaller/Unity-6000.3.24f1.tar.xz'
tar -xJf ~/Unity/downloads/Unity-6000.3.24f1.tar.xz -C ~/Unity/Hub/Editor/6000.3.24f1

# Blender 5.2.2 (user-space)
curl -L -o ~/apps/blender-5.2.2-linux-x64.tar.xz 'https://download.blender.org/release/Blender5.2/blender-5.2.2-linux-x64.tar.xz'
tar -xJf ~/apps/blender-5.2.2-linux-x64.tar.xz -C ~/apps
ln -sf ~/apps/blender-5.2.2-linux-x64/blender ~/.local/bin/blender
```

Also see `scripts/install-unity-editor.sh`, `scripts/setup-dev-environment.sh`, `scripts/check-environment.sh`.

## 3. Run the editor (verify — USER ACTION REQUIRED)

1. **License activation is a user action** (needs your Unity account; never put credentials in scripts):
   ```bash
   export PATH="$HOME/.local/bin:$PATH"
   ~/Unity/Hub/Editor/6000.3.24f1/Editor/Unity -batchmode -quit -createManualActivationFile -logFile /tmp/unity-activation.log
   # → produces Unity_v6000.3.24f1.alf — upload at https://license.unity3d.com/manual,
   #   download Unity_v6000.x.ulf, then:
   ~/Unity/Hub/Editor/6000.3.24f1/Editor/Unity -batchmode -quit -manualLicenseFile Unity_v6000.x.ulf -logFile /tmp/unity-license.log
   ```
   (Or install Unity Hub later and sign in there for the GUI flow.)
2. First project open:
   ```bash
   ~/Unity/Hub/Editor/6000.3.24f1/Editor/Unity -projectPath /home/housseyn/workspace/gaming/glad-to-see-you -logFile /tmp/unity-open.log
   ```
   If the editor refuses to start on Ubuntu 20.04 (glibc), use the Windows route (§5).

## 4. Android build support (scripted — verify)

Module payloads for Linux (verified URLs, diff from the editor changeset):
- OpenJDK 17.0.18+8: `https://download.unity3d.com/download_unity/open-jdk/open-jdk-linux-x64/jdk17.0.18-8_86b9da7ec57717bdf4d79c35f1c2dde77b5a587fb706909085a8902cf37ead51.zip`
- Android SDK & NDK tools: `https://download.unity3d.com/download_unity/android-sdk-tools/1_5312bb398affd0d94b90d3780976e1a162aa91944ef6bb40c8feb10ad6cc360d.zip`
- The Android **PlaybackEngine** (maker of `AndroidPlayer`) ships via Unity Hub's module install;
  if Hub is unavailable, prefer installing the Android module from the **Windows editor** (Hub UI:
  Add modules → Android Build Support + OpenJDK + SDK/NDK) and copy nothing — Android builds can run
  from the Windows editor while the repo stays in WSL. Use `scripts/verify-unity-project.sh` to check status.

Unzip targets for a manual Linux attempt (layout Unity expects):
```
~/Unity/Hub/Editor/6000.3.24f1/Editor/Data/PlaybackEngines/AndroidPlayer/{SDK,NDK,OpenJDK}
```

## 5. Windows-side editor (recommended if WSL route is unstable)

- Install Unity Hub on Windows; add **Unity 6000.3.24f1** + Android modules.
- Open the project from `\\wsl.localhost\Ubuntu\home\housseyn\workspace\gaming\glad-to-see-you`
  (works; `Library/` will rebuild and be slower over the 9P mount — acceptable for the slice).
- Alternative for speed: clone the repo on the Windows filesystem for editor work and treat WSL as the
  git/repo home. Keep one source of truth; don't edit both copies.

## 6. PATH reminder

Scripts and docs assume:
```bash
export PATH="$HOME/.local/bin:$PATH"    # git-lfs, uv/uvx, blender
```
Add it to `~/.zshrc` if you want it permanently (not done automatically — we don't overwrite shell configs).

## 7. Open the project (after activation)

1. Unity opens `glad-to-see-you/` (it will import packages; first time takes a while).
2. Menu: `Glad to See You ▸ Bootstrap ▸ 1. Setup Project` (URP assets, layers, quality levels, physics).
3. Menu: `Glad to See You ▸ Bootstrap ▸ 2. Build Vertical Slice Scene` → saves `Assets/_Game/Scenes/Arena_VerticalSlice.unity`.
4. Press Play. Keyboard/gamepad controls; window ▸ Test Runner for EditMode/PlayMode suites.

## 8. Verification commands

```bash
./scripts/check-environment.sh            # tool inventory + versions
./scripts/verify-unity-project.sh         # editor present? manifest sane? module status
./scripts/verify-mcp.sh                   # MCP server commands resolvable (offline check)
```
