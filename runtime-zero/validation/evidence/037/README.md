# RZ-037 evidence — local graphics toolchain + AI-generated stage art

Owner feedback (round 5, verbatim): "you task now is to install tools and use
them to achieve this". This ticket installs a fully local, license-clean image
generation stack (no paid APIs — constraint D-005) and uses it to produce stage
art for the game.

## Installed (all under `~/ai`, outside the repository — large artifacts never
enter git)

| Component | Version / location | Note |
|---|---|---|
| ComfyUI | v0.37.0, `b0f4b7b294ce482a2e071d9d762c133d38c7aa07` (2026-09-20) at `~/ai/ComfyUI` | git clone --depth 1 |
| Python venv | `~/ai/comfy-venv` (CPython 3.12.14, uv) | isolated from system Python |
| PyTorch | `torch==2.8.0+cu128`, `torchvision==0.23.0+cu128`, `torchaudio==2.8.0` | upgraded from 2.6.0+cu124: ComfyUI's `comfy-kitchen` custom ops fail schema inference on torch 2.6 (`stride: list[int]`) |
| CUDA check | `torch.cuda.is_available() == True`, device RTX 4050 Laptop GPU | host driver 581.86 (CUDA 13.0 capable) |
| Model | `sd_xl_turbo_1.0_fp16.safetensors`, 6938081905 bytes, sha256 `e869ac7d6942cb327d68d5ed83a40447aadf20e0c3358d98b2cc9e270db0da26` | stabilityai/sdxl-turbo fp16, in `~/ai/ComfyUI/models/checkpoints/` |

Install log: `install-log-excerpt.txt` (merged from the clone/resume scripts;
one resume after a `pypi.nvidia.com` timeout with `UV_HTTP_TIMEOUT=600`).

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
| `torch.cuda.is_available()` | `True` on RTX 4050 Laptop (before and after the 2.8 upgrade) |
| model file | `sd_xl_turbo_1.0_fp16.safetensors`, 6938081905 bytes, sha256 `e869ac7d…` (`install-log-excerpt.txt`) |
| server boot | ComfyUI v0.37.0 answers `/system_stats`; 5073 MB VRAM free at idle |
| generation run | 3 of 3 prompts rendered: candidates below, seeds + hashes in `generation-log.txt`, graph in `generation-workflow.json` |
| gameplay untouched | procedural default unchanged; swap is a manual, reversible script (`tools/use_ai_backdrops.sh copy|revert`) |
| swap demo | `copy` → map + combat captured on the AI look (`map-with-ai-backdrop.png`, `combat-with-ai-backdrop.png`); `revert` restores the procedural art byte-for-byte — the map capture hash is `fe0bc419…` before and after |
| provenance | `docs/SOURCES.md` dated finding + this directory |

## Generated candidates (from the game's own prompts)

All three rendered on the RTX 4050 through the local `/prompt` API — sampler
`euler_ancestral` / `normal`, **6 steps, cfg 1.0**, 1024×576, batch 1; tool
`tools/make_ai_backdrops.py`.

| Region | Candidate (`candidates/`, local-only — gitignored by convention) | Look | sha256 prefix |
|---|---|---|---|
| Intrusion | `intrusion_sdxl.png` | teal-lit night skyline against an orange dusk — matches the cyan-on-navy palette | `f2c1e39b…` |
| Load Spike | `load_spike_sdxl.png` | magenta/violet spike field with cyan streaks — high-energy abstract stage | `b41e9005…` |
| Server Cathedral | `server_cathedral_sdxl.png` | dark data-center nave, cyan trim lines, amber LED racks, central aisle beam | `538cbd05…` |

The candidates are **not committed** (repo `.gitignore` keeps generated
candidates out of history by design — see also `docs/ART_BIBLE.md`, rejected
candidates stay outside `game/assets/`). The committed review material is the
in-game captures below plus the hashes in `generation-log.txt`; regenerate the
files any time with the tool (steps in the README of this directory / the swap
script's error message).

## How they may reach the game (owner gate)

The **deterministic procedural art stays the shipped, hash-pinned default**
(RZ-036); the candidates above are review material. The owner can try them
in-game with the deliberate, reversible opt-in:

```
tools/use_ai_backdrops.sh copy     # use the AI candidates
tools/use_ai_backdrops.sh revert   # re-run the deterministic generator
```

`copy` also re-imports the Godot texture cache (verified: without it the game
kept showing the old art). The candidates folder is local-only; on a fresh
clone regenerate it first (see the script's error message for the two steps).

A swap is the owner's call at the RZ-012 style gate; nothing auto-switches.

_Status: toolchain installed, CUDA verified, three candidates generated and
recorded; awaiting the owner's style-gate decision on swapping._
