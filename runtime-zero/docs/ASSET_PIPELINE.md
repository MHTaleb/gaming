# Local asset factory implementation orders

Implement incrementally after the playable slice. No paid image/audio generation and no cloud fallback. Generated output is a candidate until validation and review succeed.

## Graphics — RZ-016 through RZ-019

1. Create a model registry and candidate/approved asset manifest using DATA_CONTRACTS.md. Keep model files outside Git. Resolve primary model repositories, revision hashes, checksums, license references, disk budgets and compatible backend versions before download.
2. Install/pin ComfyUI and one SDXL checkpoint under SETUP.md. Export a tested workflow in API format. A visual editor graph is not interchangeable with the API execution graph. Save workflow hash and a binding map from business parameters to node inputs; validate required node types are present in `/object_info` for that installation.
3. Implement a CLI/application adapter: submit a workflow to the local service, track its prompt ID, wait with a deadline, inspect execution errors, retrieve only output nodes belonging to the submitted job, and copy validated image bytes to the candidate directory. Do not blindly import every file in ComfyUI's output folder.
4. Add prompts from ART_BIBLE.md, explicit dimensions, seed, and reference IDs. Preserve the original workflow and metadata. For PNGs verify decode, size, alpha expectations and nonempty image content. Hash original and processed versions.
5. Implement explicit promotion: approved candidate → validated `game/assets/` target → provenance update → Godot import check. Use atomic writes and refuse accidental overwrite unless the request identifies the asset version being replaced.
6. Add ControlNet and IP-Adapter separately with compatible nodes/weights and a small comparison sheet. Benchmark memory. Add background removal and upscaling only when an asset needs them.

Do not require an existing ComfyUI MCP server. The owned HTTP adapter is the baseline. A third-party MCP may be evaluated later but must not change the high-level studio contract.

## Music and sound — RZ-023 through RZ-025

Use the primary ACE-Step project for local music and Stability-AI/stable-audio-tools for SFX experiments. The code and weights may have different licenses; verify both at the exact revision. Do not rely on fork metadata or earlier conversation claims about commercial permission or VRAM requirements.

ACE-Step adapter: launch the pinned documented API, use its installed schema, submit an async task, poll task state and fetch the returned audio. The currently documented `/release_task` → `/query_result` → `/v1/audio` flow is a starting reference, not an immutable schema. Store backend task IDs so retries do not submit duplicate jobs blindly.

Stable Audio adapter: invoke a bounded worker process in its own environment using the official inference API. Do not keep its model resident alongside the image or music model. Start with a short effect and conservative settings supported by that model. Verify the selected model's actual duration/sample-rate/channel constraints; do not hardcode assumptions from another variant.

Postprocess with FFmpeg: decode and inspect with ffprobe, trim unwanted silence deliberately, normalize without clipping, add fades/crossfade where needed, export WAV or OGG as appropriate, and check the exported file again. Keep unprocessed masters outside shipped assets. Document project loudness targets during the audio review; do not treat all SFX like full-length music.

A `loop=true` request requires measured/inspected loop boundaries and an audible review. Generation alone does not guarantee a seamless loop. Instrumental music must be checked for unintended vocals. Sound review includes distortion, silence, abrupt cuts, distracting artifacts and relative loudness in-game.

## GPU ownership

One shared queue/lease controls all project-owned GPU jobs across image and audio adapters. Measure free/peak memory and wall time; external GPU consumers may exist. Do not kill them. Before switching backend, stop/unload only the studio-owned worker and verify memory actually returns. A cache-clear call alone does not prove model release.

Use deadlines, bounded retries, cancellation, OOM reporting and stale-lock recovery. First test two concurrent submissions and worker crash recovery with fakes, then one real switch on the laptop. Record hardware/driver/backend/workflow hashes. Pixel-exact reproducibility across GPUs is not promised.

## Minimum integrated proof

Agent request → Studio MCP → local backend → candidate file → validation → explicit review/promotion → Godot import. Demonstrate one item icon, one short SFX and one music loop independently. Keep integration tickets open if only fake responses or placeholder files were used.
