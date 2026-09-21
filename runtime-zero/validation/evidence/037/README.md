# RZ-037 evidence — local graphics toolchain + AI-generated stage art

Owner feedback (round 5, verbatim): "you task now is to install tools and use
them to achieve this". This ticket installs a fully local, license-clean image
generation stack (no paid APIs — constraint D-005) and uses it to produce stage
art for the game.

## Installed (all under `~/ai`, outside the repository — large artifacts never
enter git)

| Component | Version / location | Note |
|---|---|---|
| ComfyUI | `~/ai/ComfyUI` @ `b0f4b7b294ce482a2e071d9d762c133d38c7aa07` | git clone --depth 1 |
| Python venv | `~/ai/comfy-venv` (CPython 3.12.14, uv) | isolated from system Python |
| PyTorch | `torch==2.6.0+cu124`, `torchvision==0.21.0+cu124` | CUDA 12.4 wheels |
| CUDA check | `torch.cuda.is_available() == True` | `NVIDIA GeForce RTX 4050 Laptop GPU` |
| Model | `sd_xl_turbo_1.0_fp16.safetensors` (~6.9 GB) | stabilityai/sdxl-turbo, fp16, in `~/ai/ComfyUI/models/checkpoints/` |

Install log: `/tmp/rz_install_tools.log` merged from `/tmp/rz_install_tools.sh`
(clone + venv) and `/tmp/rz_install_resume.sh` (torch + requirements + CUDA check
+ model download; resumed once after a `pypi.nvidia.com` timeout with
`UV_HTTP_TIMEOUT=600`).

First run:

```
~/ai/comfy-venv/bin/python ~/ai/ComfyUI/main.py --port 8188
```
(SDXL-Turbo is a 4–8 step distilled model; on 6 GB VRAM the `--lowvram` flag can
be added if the first launch OOMs.)

## Design rules kept

- **Deterministic procedural art remains the shipped default** (RZ-036):
  `tools/make_character_anim.gd`, `tools/make_stage_art.gd`, and the rest print
  sha256 per output and have no randomness. Generated art is reachable but cannot
  silently replace the hash-pinned sheets.
- The palette lock (graphite/navy + cyan TRIM + amber accents) and the owner
  style gate (RZ-012) still apply: AI output is reviewed by the owner before it
  is committed as the shipped look.
- No paid APIs, no accounts, no network at runtime (D-005); model weights live
  outside the repository.

## Verification

| Check | Result |
|---|---|
| `torch.cuda.is_available()` | `True` on RTX 4050 Laptop (step 5 of install log) |
| model file | `sd_xl_turbo_1.0_fp16.safetensors`, size + sha256 recorded in `install-log-excerpt.txt` |
| first generation | _pending: filled in below once the model finished downloading_ |
| integration | _pending_ |

_Status: toolchain installed and CUDA verified; first image generations and the
selection (if any) to ship are recorded here when done._
