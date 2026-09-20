# Environment inventory — RZ-001

- Ticket: RZ-001 (Measure the actual Lenovo environment)
- Agent: GitHub Copilot (DeepSeek V4.1 Flash selected in Copilot; single writer, session 2026-09-20)
- Date: 2026-09-20
- Classification: **local** — WSL2 (Ubuntu 20.04.6) running on Housseyn's Lenovo laptop. Not a remote machine, not a container, not this repository's CI. Windows interop (`powershell.exe`) responds from WSL, `/mnt/c` is present, and the GPU is a real passthrough device, so the terminal is on the physical laptop.

Raw command output was captured in the session terminal, not committed (see "Sanitized observations" below). Full logs can be regenerated with the commands listed per section.

## Host (Windows 11, measured via `powershell.exe` from WSL)

| Item | Measured value |
|---|---|
| Manufacturer / model | LENOVO 83GS (LOQ, 12th Gen Intel host) |
| OS | Windows 11 Famille, build 10.0.26200, 64-bit |
| Physical RAM | 25,463,480,320 bytes ≈ **23.7 GiB** |
| GPU 1 (iGPU) | Intel UHD Graphics, driver 32.0.101.7026 |
| GPU 2 (dGPU) | NVIDIA GeForce RTX 4050 Laptop GPU, Windows driver 32.0.15.8186 |
| System volume C: | 474.7 GB total, **94.4 GB free (81% used)** |
| WSL default distro | Ubuntu-20.04, WSL **version 2** |
| Other WSL distro | docker-desktop (Stopped) — Docker Desktop installed on Windows |
| winget | Present (`winget.exe`) |
| VS Code (Windows) | Present (`Microsoft VS Code\bin\code.cmd`) |
| git (Windows) | Missing (Git only inside WSL) |
| python (Windows) | Only the Microsoft Store stub is on PATH |

Commands: `Get-CimInstance Win32_ComputerSystem|Win32_OperatingSystem|Win32_VideoController`, `Get-Volume`, `wsl --status`, `wsl --list --verbose`, `Get-Command winget,git,code`.

## WSL (Ubuntu) environment

| Item | Measured value |
|---|---|
| Kernel | `6.6.87.2-microsoft-standard-WSL2` (WSL2 confirmed) |
| Distribution | Ubuntu 20.04.6 LTS, x86_64 |
| CPU | Intel Core i5-12450HX, 12 threads visible |
| RAM visible to WSL | 11 GiB + 3 GiB swap (WSL2 default split of the 23.7 GiB host) |
| Local disk (`/dev/sdd`) | 1007 GB virtual, 936 GB avail — sparse VHDX; real limit is C: free space (94.4 GB) |
| Checkout location | `~/workspace/gaming` — on the ext4 filesystem, not `/mnt/c` (correct per SETUP.md) |
| sudo | Password required — non-interactive `apt-get` unavailable; user-space installs chosen |
| WSLg | Working: `DISPLAY=:0`, wayland socket, `/mnt/wslg`, `/tmp/.X11-unix/X0` → Godot GUI is viable |
| Ports | 8090 (board), 8188 (ComfyUI), 8001 (ACE-Step) not yet bound; check before each service |

### GPU passthrough (the important number)

```
nvidia-smi --query-gpu=name,memory.total,memory.free,driver_version --format=csv
NVIDIA GeForce RTX 4050 Laptop GPU, 6141 MiB, 5554 MiB, 581.86
nvidia-smi header: Driver 581.86, CUDA 13.0; 368 MiB in use while idle
```

**Measured VRAM is 6141 MiB (~6 GB), not 8 GB.** D-004's conservative "≈8 GB" guess and the
user-reported RTX 4060 are both superseded by this measurement: the device is an RTX 4050
Laptop GPU with 6 GB. Per SETUP.md, the Windows NVIDIA driver (32.0.15.8186) provides WSL
access; **no Linux display driver was installed inside WSL and none should be.**

## Tool inventory

| Tool | Status | Version / path | Notes |
|---|---|---|---|
| git | present (old) | 2.25.1 (Ubuntu system) | fine for now; newer git needs sudo apt; defer |
| Node via nvm | present ×2 | nvm 0.39.7; **v22.23.2 = default (lts/jod)**; v20.20.0 also installed | `.nvmrc` = 22; board minimum met **on the machine** |
| Node in VS Code terminals | shadowed | integrated terminals inherit `NVM_BIN=v20.20.0` | fresh shells get 22 (verified with clean-env zsh); workaround: restart VS Code window or `nvm use default` |
| npm | present | 10.9.8 (with Node 22) | no board dependencies to install |
| python3 | present (old) | 3.8.10; venv OK; pip 20.0.2 | modern tooling will use uv-managed Pythons; nothing needs system 3.12 yet |
| uv | **missing** | — | install in RZ-002 (user-space) |
| Godot | present (old) | **4.1.3-stable** at `~/.local/godot/Godot_v4.1.3-stable_linux.x86_64`, symlinked `~/.local/bin/godot` | below current stable; RZ-002 installs a supported Godot 4 release and repoints the symlink; old binary kept |
| `~/.local/bin` on PATH | no | `.zshrc` line 2 is commented out | `godot` is not resolvable as a bare command in user shells; call the path directly or export PATH |
| ffmpeg | missing | — | P5 (audio); defer; no all-at-once installs |
| nvidia-smi | present | `/usr/lib/wsl/lib/nvidia-smi` | GPU access works from WSL |
| VS Code / Remote-WSL | working | server + 14 remote extensions | notable: `vizards.deepseek-v4-for-copilot-0.9.2`; no Python/Godot extension yet |
| Docker Desktop | installed, distro stopped | docker-desktop WSL distro | potential VRAM/RAM consumer; keep stopped unless needed |

`python3 tools/doctor.py` → exit 0, report generated (read-only). Missing tools reported as
`missing`, never as failures: `uv`, `godot`, `ffmpeg` at the time of RZ-001.

## Reported vs measured (recorded honestly)

| Claim | Reported | Measured | Recording |
|---|---|---|---|
| GPU | RTX 4060, design for ≈8 GB VRAM (D-004) | RTX 4050 Laptop, 6141 MiB | use measured; treat 6 GB as the budget |
| RAM | unknown | 23.7 GiB host / 11 GiB in WSL | as measured |
| Storage | unknown | 94.4 GB free on C: | real constraint is the host volume |
| Environment | Lenovo possible, unknown | WSL2 on the Lenovo itself, local | no cloud certification problem for this work |

## Budgets for later phases (from measurements)

- **VRAM (6141 MiB)**: one job at a time. SDXL 1024²/torch `medvram`+tiled VAE is expected to be tight (~5–6 GB); start at 768² and measure before raising. ACE-Step (~4 GB class) should fit alone. Never keep two models resident; the P4 scheduler (RZ-022) must serialize.
- **RAM (11 GiB in WSL)**: keep Godot editor + one Python env + VS Code; if OOM appears in P3–P5, a `.wslconfig` memory bump is a **host change for Housseyn** to approve (not applied).
- **Disk (94.4 GB free on C:)**: rough plan — prototype < 2 GB; Python/studio envs ≈ 2 GB; ComfyUI + Torch + SDXL + one ControlNet/IP-Adapter ≈ 15–20 GB; audio backends ≈ 15–20 GB; Android tooling ≈ 5–10 GB. Keep bulk caches/outputs under `~/ai/...` (outside Git) and re-check free space before each download; if < 60 GB free when P3 starts, re-plan before pulling model weights. The WSL VHDX does not return space to Windows automatically.

## Required host actions (nothing blocking RZ-002)

1. None mandatory. Optional: restart the VS Code window so integrated terminals pick up Node 22 (`nvm use default` also works per-terminal).
2. VHDX/sparse-disk caution above; no sudo action needed for the planned user-space installs.
3. No model downloads were made during inventory (per START_HERE step 2).

## Sanitized observations

- Windows username, full private inventory and raw logs: kept out of Git (`/tmp` during session).
- No secrets or tokens were read, printed, or stored. Nothing was installed by RZ-001 (read-only, by design).
