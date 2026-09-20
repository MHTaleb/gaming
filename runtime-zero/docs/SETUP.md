# Local machine installation orders

You are the installing agent. Execute supported installation commands; do not hand the user a shopping list and claim completion. Installation is authorized for this project, subject to the machine's real permission prompts. Detect before installing. Never assume a tool is absent or a version is compatible.

## RZ-001 — inventory before mutation

From Windows PowerShell when available:

```powershell
wsl --status
wsl --list --verbose
Get-CimInstance Win32_ComputerSystem | Select-Object TotalPhysicalMemory
Get-CimInstance Win32_VideoController | Select-Object Name
Get-Volume | Select-Object DriveLetter, SizeRemaining, Size
Get-Command winget, git, code -ErrorAction SilentlyContinue
```

From WSL/Linux:

```bash
uname -a
cat /etc/os-release
free -h
lscpu
 df -h .
command -v git node npm python3 uv godot ffmpeg nvidia-smi
nvidia-smi --query-gpu=name,memory.total,memory.free,driver_version --format=csv
```

Also run `python3 tools/doctor.py` if Python exists. Capture exit codes and output. A missing GPU or failed command is a finding, not a reason to fabricate a green report. Record sanitized observations in reports/environment.md. Keep a private full inventory outside Git if it contains identifying information. The doctor is read-only and does not install anything.

Choose a memory/storage budget based on measurements. Start batch=1, one GPU job at a time. Check each download's actual size plus install/cache/headroom; do not promise the whole toolchain fits a guessed disk budget. If memory/storage is insufficient, retain the CPU-only prototype and block only the affected generation ticket.

## RZ-002 — install the minimum environment

1. If WSL2 is absent, use Microsoft's current WSL install instructions. Typical elevated Windows command is `wsl --install -d Ubuntu`. Ask for elevation/restart through the real host UI if needed; resume by checking `wsl --list --verbose`. Do not create a second distribution when one already works.
2. Use the Windows NVIDIA driver for WSL GPU access. Do not install a Linux NVIDIA display driver inside WSL. If `nvidia-smi` is not on PATH, check `/usr/lib/wsl/lib/nvidia-smi`. Update the Windows driver only through the official supported installer with any required user interaction.
3. Install VS Code on Windows and its Remote WSL support. If absent and winget is available, first verify exact IDs using `winget show --id Microsoft.VisualStudioCode --exact` (similarly `Git.Git`). Then install the verified package with `winget install --id <verified-id> --exact`. Do not bypass prompts. In VS Code install the official GitHub Copilot tooling, Python extension and Godot tooling as needed; verify publisher/extension IDs before installing.
4. In Ubuntu, use the distro package manager for basic tools:

```bash
sudo apt-get update
sudo apt-get install git curl ca-certificates unzip python3 python3-venv python3-pip
```

Do not request/record the user's sudo password. If elevation is unavailable, report the exact command for the user and continue work that does not need it.

5. Install a supported Node LTS through an official distribution or a verified version manager. Node 22 is this board's minimum and matches the sibling project's recorded baseline; use a supported newer LTS if compatible. Do not install an obsolete distro package blindly. This board has no npm dependencies: no `npm install` is required. Verify `node --version`, `node tools/verify.js`.
6. Install `uv` using Astral's documented standalone or package method. Download and inspect an installer before executing; do not pipe an unexamined remote script to a shell. Record source and exact version. Keep each AI backend in its own environment; do not `sudo pip install` into system Python.
7. Install the standard GDScript build of one supported Godot 4 stable release from godotengine.org, using the exact release archive and published checksums where provided. The earlier 4.6 suggestion is not a mandatory stale pin. Inspect archive members, extract the verified executable to a user tool directory such as `~/.local/bin/godot`, and record the actual executable path/version. Install matching export templates when export work starts, not mismatched templates from another version. Avoid a distro Godot 3 package and avoid .NET requirements for GDScript.
8. Prefer the Linux Godot editor in WSLg so editor, CLI and project paths share one environment. Test `godot --version` and, after RZ-004 creates the project, GUI launch and headless import. If WSLg is unusable, document a Windows-editor/WSL-CLI split with matching engine versions and tested path mapping. Do not launch two editors against the same project simultaneously.
9. Keep the checkout on the WSL filesystem, e.g. `~/projects/gaming`, if that is where tooling runs. Open `runtime-zero` with VS Code Remote WSL. Do not reclone over existing work. Use normal Git authentication; never embed a token in a remote URL.
10. Verify Git, Python venv creation, Node, Godot, VS Code's WSL terminal, and Copilot's ability to read a file and execute a benign command. Ask the selected DeepSeek configuration to call that same tool and report its result. If unavailable, record the limitation and continue with a supported tool-capable coding model; do not purchase access or pretend the model was tested.

Write reports/environment.md and config/toolchain.lock.json. The lock records `tool`, `version`, `source_url`, `checksum_or_commit`, `installed_environment`, `verification_command`, `result`, `checked_at`. It is installation evidence, not a list of requested versions. Leave unavailable tools explicitly blocked.

## Phase-based installation matrix

| Stage | Install / configure | Required evidence |
|---|---|---|
| Prototype | Git, Node, Python/venv, VS Code/WSL, Godot 4 | Versions, board check, GUI launch and headless test after project creation |
| Python tools | uv and a project-local locked environment | `uv sync --frozen` after the lock exists; tests run from a clean venv |
| Graphics | ComfyUI, compatible PyTorch CUDA wheel, ONE SDXL checkpoint | `torch.cuda.is_available()`, device name, one saved PNG, peak VRAM/time |
| Graphics control | Matching ControlNet, IP-Adapter/image encoder, optional rembg/upscaler | Each added independently; reference/pose comparison and memory measurement |
| Manual editing | Krita; optional Krita AI Diffusion | Open an image and, if plugin used, verify connection to the pinned ComfyUI setup |
| Audio | FFmpeg/ffprobe, ACE-Step and Stable Audio tools in separate envs | Local short WAV from each selected backend; decode/duration checks |
| Manual audio | Audacity when human cleanup is needed | Open/export a test WAV |
| Android | Matching templates, JDK and SDK specified by pinned Godot docs | Debug APK installed/launched on a user-authorized device |
| Optional later | Aseprite or a free suitable editor, style LoRA training | Do not purchase Aseprite automatically; no training before approved dataset |

## Backend setup procedure

For every backend: read its official install guide (docs/SOURCES.md), resolve a release/commit, create an isolated environment, install pinned dependencies, lock successful resolution, and run its documented minimal smoke test. Match PyTorch wheels to the supported driver and backend; do not independently install xFormers or upgrade Torch until that combination is confirmed compatible. A full CUDA toolkit is only needed if a selected dependency actually compiles CUDA extensions.

Use directories outside the game repository, e.g. `~/ai/comfyui`, `~/ai/ace-step`, `~/ai/stable-audio`, `~/ai/models`, `~/ai/outputs`. Reference them through local config/environment variables; never commit personal absolute paths. Keep download URLs, exact model revisions and SHA-256 values in the sanitized model manifest. Never accept a gated model's terms on the user's behalf.

Bind services to loopback. Verify the documented listen/port arguments for the pinned revision. Probe ComfyUI on its configured address (conventional port 8188) and ACE-Step on its configured address (often 8001); ports are configurable, not proof of readiness. Check for conflicts before launch. Record PID, health check and shutdown procedure; never kill unrelated processes to free VRAM.

For graphics, begin at 768×768 or 1024×1024 when measured memory allows, batch 1, compatible mixed precision and efficient attention. Add tiled VAE/offload if supported. A failed generation triggers a bounded reduction and recorded retry; it must not trigger a cloud API.

## Recovery and idempotency

Re-running setup must reuse a verified install or explain a necessary upgrade. Do not delete environments or model files without identifying the project-owned target. Save old configuration before changing it. After failure, record what changed, how to roll back, and the exact retry command. Uninstall only project-created resources. Agents should create repeatable phase setup scripts once a tested install sequence is known; do not encode guessed package versions or flags.
