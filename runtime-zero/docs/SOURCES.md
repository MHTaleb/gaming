# External capability references

Consult these primary sources at installation time and pin what actually works. Inspection date for this specification: 2026-09-20. A source link is not proof that software is installed or compatible with Housseyn's machine.

| Component | Primary reference | Finding / instruction |
|---|---|---|
| VS Code instructions | https://code.visualstudio.com/docs/agent-customization/custom-instructions | Workspace Copilot instructions and path-based instruction files are supported; nested AGENTS behavior may vary. Verify loading in the installed client. |
| VS Code MCP | https://code.visualstudio.com/docs/agent-customization/mcp-servers | Configure local MCP in the workspace; verify current schema and tool trust in the installed client. |
| WSL installation | https://learn.microsoft.com/windows/wsl/install | Use current supported Windows/WSL installation procedure when required. |
| NVIDIA WSL | https://docs.nvidia.com/cuda/wsl-user-guide/index.html | Windows driver exposes GPU access to WSL; do not install a separate Linux display driver inside WSL. |
| Godot release/install | https://godotengine.org/download/ | Resolve and pin a supported stable release; confirm official archive/checksum before installation. |
| Godot Android | https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_android.html | Export setup depends on engine version; use matching templates and documented SDK/JDK. |
| Godot CLI | https://docs.godotengine.org/en/stable/tutorials/editor/command_line_tutorial.html | Check headless/script/export flags against the pinned binary's help. |
| ComfyUI routes | https://docs.comfy.org/development/comfyui-server/comms_routes | The local API provides workflow submission/history/output operations; validate the installed revision. |
| ComfyUI code | https://github.com/Comfy-Org/ComfyUI | Pin source and compatible dependencies before adding custom nodes. |
| SDXL weights | https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0 | Read exact model card/license before download and commercial asset promotion. |
| ACE-Step | https://github.com/ace-step/ACE-Step-1.5 | Use primary upstream rather than assuming a fork is authoritative. |
| ACE-Step API | https://github.com/ace-step/ACE-Step-1.5/blob/main/docs/en/API.md | Documents asynchronous local task submission/query/audio retrieval. Verify pinned request fields. |
| ACE-Step install | https://github.com/ace-step/ACE-Step-1.5/blob/main/docs/en/INSTALL.md | Follow current supported isolated install; benchmark actual model/profile on the laptop. |
| Stable Audio tooling | https://github.com/Stability-AI/stable-audio-tools | Official Python inference tooling; code license does not establish rights for all weights. |
| Stable Audio weights | https://huggingface.co/stabilityai/stable-audio-open-1.0 | Verify chosen model's license and inference constraints; do not use a blanket revenue/license claim from conversation. |
| MCP Python SDK | https://github.com/modelcontextprotocol/python-sdk | Pin a supported SDK release and test the implemented stdio interface. |
| uv | https://docs.astral.sh/uv/getting-started/installation/ | Follow supported install method and lock project dependencies. |
| Krita integration | https://github.com/Acly/krita-ai-diffusion | Optional manual-art workflow; inspect version compatibility before connection. |
| DeepSeek integration claim | https://api-docs.deepseek.com/quick_start/agent_integrations/github_copilot/ | Could not retrieve this claimed guide during this inspection. Treat availability/tool calling as unverified until tested in the user's installed client/account. |

Only the VS Code instruction/MCP, NVIDIA WSL, Godot Android, ComfyUI routes, ACE-Step repository/API/install, and Stable Audio tooling pages were retrieved for capability checks in this work. Other links are installation-time starting points, not claims of a tested installation. No third-party ComfyUI or Godot MCP is a mandatory dependency.

Record later research as a dated finding with source/revision, observed constraints, affected tickets and uncertainty. Never copy previously asserted model names, license rights or minimum VRAM figures into a lockfile without verifying them.

## Dated findings

### 2026-09-21 — local graphics toolchain installed (RZ-037)

| Component | Revision actually installed | Source |
|---|---|---|
| ComfyUI | v0.37.0, `b0f4b7b294ce482a2e071d9d762c133d38c7aa07` (2026-09-20, git clone --depth 1) at `~/ai/ComfyUI` | https://github.com/Comfy-Org/ComfyUI |
| PyTorch | `torch 2.8.0+cu128`, `torchvision 0.23.0+cu128`, `torchaudio 2.8.0` — upgraded from 2.6.0+cu124 because ComfyUI's `comfy-kitchen` custom ops fail schema inference on torch 2.6 (`stride: list[int]`) | https://download.pytorch.org/whl/cu128 |
| Model weights | `sd_xl_turbo_1.0_fp16.safetensors`, 6938081905 bytes, sha256 `e869ac7d6942cb327d68d5ed83a40447aadf20e0c3358d98b2cc9e270db0da26` at `~/ai/ComfyUI/models/checkpoints/` | https://huggingface.co/stabilityai/sdxl-turbo |
| venv | CPython 3.12.14 via uv at `~/ai/comfy-venv` | https://docs.astral.sh/uv/ |

Observed: `torch.cuda.is_available() == True` on the RTX 4050 Laptop (6141 MiB VRAM
reported by nvidia-smi; host driver 581.86/CUDA 13.0 capable); SDXL-Turbo is a
4–8 step distilled checkpoint, chosen for that VRAM budget. Install had to be
resumed once after a `pypi.nvidia.com` download timeout (`UV_HTTP_TIMEOUT=600`).
Weights and the toolchain live outside the repository (`~/ai`) per D-005 — no
paid APIs, no service accounts; the procedural generators remain the shipped,
hash-pinned default until the owner style gate (RZ-012) approves AI output.
License of the downloaded weights: check the model card before any commercial
promotion; not asserted here.

