#!/usr/bin/env python3
"""Generate Runtime Zero stage concepts with the local ComfyUI SDXL-Turbo.

Talks to the local ComfyUI HTTP API (default http://127.0.0.1:8188):
POST /prompt, poll /history/<id>, then copy the PNGs to an output dir.

Usage:
  python3 rz_gen_art.py <out_dir> [prefix]

No network beyond localhost; weights live under ~/ai (outside the repo).
"""
import json
import shutil
import sys
import time
import urllib.request

HOST = "http://127.0.0.1:8188"
MODEL = "sd_xl_turbo_1.0_fp16.safetensors"
WIDTH, HEIGHT = 1024, 576
STEPS = 6
SEED = 20260921

PROMPTS = {
    "intrusion": (
        "night rooftop view of a dark office city skyline, tall towers with a few "
        "scattered lit windows, deep navy blue and graphite palette, cyan glowing "
        "horizon line, amber accents, moody minimal 2D game background concept art, "
        "flat painterly style, clean, no text, no characters"
    ),
    "load_spike": (
        "abstract server load spike visualization, jagged magenta and violet energy "
        "spikes rising from a dark horizon, flowing data stream lines, deep dark "
        "background, cyan rim light, 2D game background concept art, flat painterly "
        "style, clean, no text, no characters"
    ),
    "server_cathedral": (
        "colossal dark data center hall like a cathedral, symmetric rows of server "
        "racks with tiny cyan and amber LED lights, massive dark pillars, a glowing "
        "cyan beam of light in the center aisle, vaulted ceiling, deep navy and "
        "graphite palette, 2D game background concept art, painterly, no text, no "
        "characters"
    ),
}


def graph(positive: str, seed: int) -> dict:
    return {
        "1": {
            "class_type": "CheckpointLoaderSimple",
            "inputs": {"ckpt_name": MODEL},
        },
        "2": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": positive, "clip": ["1", 1]},
        },
        "3": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": "", "clip": ["1", 1]},
        },
        "4": {
            "class_type": "EmptyLatentImage",
            "inputs": {"width": WIDTH, "height": HEIGHT, "batch_size": 1},
        },
        "5": {
            "class_type": "KSampler",
            "inputs": {
                "model": ["1", 0],
                "positive": ["2", 0],
                "negative": ["3", 0],
                "latent_image": ["4", 0],
                "seed": seed,
                "steps": STEPS,
                "cfg": 1.0,
                "sampler_name": "euler_ancestral",
                "scheduler": "normal",
                "denoise": 1.0,
            },
        },
        "6": {
            "class_type": "VAEDecode",
            "inputs": {"samples": ["5", 0], "vae": ["1", 2]},
        },
        "7": {
            "class_type": "SaveImage",
            "inputs": {"images": ["6", 0], "filename_prefix": "rz"},
        },
    }


def post(path: str, payload: dict) -> dict:
    request = urllib.request.Request(
        HOST + path,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.loads(response.read().decode("utf-8"))


def get(path: str) -> dict:
    with urllib.request.urlopen(HOST + path, timeout=60) as response:
        return json.loads(response.read().decode("utf-8"))


def main() -> int:
    out_dir = sys.argv[1] if len(sys.argv) > 1 else "/tmp/rz_ai_art"
    only = sys.argv[2] if len(sys.argv) > 2 else ""
    for index, (name, prompt) in enumerate(PROMPTS.items()):
        if only and only != name:
            continue
        print(f"== {name} ==", flush=True)
        submitted = post("/prompt", {"prompt": graph(prompt, SEED + index)})
        prompt_id = submitted.get("prompt_id")
        if not prompt_id:
            print("submit failed:", submitted)
            return 1
        start = time.time()
        while True:
            history = get(f"/history/{prompt_id}")
            if prompt_id in history:
                break
            if time.time() - start > 600:
                print("timeout waiting for", prompt_id)
                return 1
            time.sleep(2)
        outputs = history[prompt_id].get("outputs", {})
        saved = []
        for node_out in outputs.values():
            for image in node_out.get("images", []):
                saved.append((image["subfolder"], image["filename"]))
        for subfolder, filename in saved:
            source = f"/home/housseyn/ai/ComfyUI/output/{subfolder}/{filename}".replace("//", "/")
            target = f"{out_dir}/{name}-{filename}"
            shutil.copyfile(source, target)
            print("saved", target, flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
