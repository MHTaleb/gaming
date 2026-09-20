# Prototype build log

Running evidence for prototype-phase tickets (P0–P1). Raw artifacts stay in ignored
`reports/local/`; this file records their location, hash and the measured outcome.

## RZ-004 — independent Godot project and first launch (2026-09-20)

Engine: **Godot 4.7.2.stable.official.ed1daf0bf** (GDScript build, sha512-verified in
`config/toolchain.lock.json`), installed at `~/.local/godot/`.

Project layout created:

```
game/project.godot            GDScript project; main scene res://scenes/title.tscn
game/scenes/title.tscn        provisional title screen (placeholder labels)
game/src/presentation/title.gd
game/src/{domain,application,infrastructure}/README.md   layer boundaries
```

Renderer: **GL Compatibility** (`rendering_method` and `.mobile`). Rationale: works
through WSLg (which exposes OpenGL 3.3 via Mesa/D3D12) and travels best to Android;
placeholder 2D does not need Forward+/Vulkan. Viewport 1280×720, `canvas_items`
stretch, orientation 0 (landscape) for the provisional landscape target.

### Checks actually run

| Command | Result |
|---|---|
| `~/.local/bin/godot --headless --path game --editor --quit` | exit 0; filesystem scan and editor init completed; no parse errors; `title.gd.uid` generated |
| `~/.local/bin/godot --path game --quit-after 300 -- --smoke-shot` | exit 0; window opened through WSLg (OpenGL 3.3 Core, Mesa 21.2.6, D3D12 device: RTX 4050); title scene rendered |

GUI-render evidence (not committed, recorded by hash):

- `reports/local/rz-004-title-smoke.png` — 1280×720 RGBA PNG, sha256
  `1304aa63480204d73240bdb079ffe758e011c2fc4b285a7a6d48bce7f413669e`
- Captured by the scene itself via `--smoke-shot` (user arg) which saves
  `user://title_smoke.png` after 5 frames and quits; the hook is presentation-only and
  inert during normal play.

Observed non-fatal warnings on WSLg (recorded, not hidden):

- `Could not set V-Sync mode ... not supported by the graphics driver`
- `libxkbcommon ... undefined symbol` messages from the WSLg X11 stack

Neither blocked rendering or input startup. If they grow into input problems, the
documented fallback is a Windows-editor/WSL-CLI split with matched engine versions.

No export templates were installed and no export preset exists yet (P6 owns that).
