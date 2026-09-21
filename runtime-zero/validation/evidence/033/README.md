# RZ-033 evidence — demo stability on WSLg

Owner playtest (RZ-012) finding: "when I hit start it closes directly". Root cause and
fix, verified on the owner's machine (Lenovo 83GS, WSL2 + WSLg, RTX 4050 via D3D12),
Godot 4.7.2, 2026-09-21 evening.

## Method

1. Reproduce with a real mouse click on Start (X11 XTEST) — crashed (signal 11 in
   `swrast_dri.so`, exit 134) right after the loadout scene loaded.
2. Reproduce without any interaction: the title alone crashed after ~20 s idle
   (`native-d3d12-crash.log`: 20 s and 21 s in two runs).
3. Isolate game vs environment: a **minimal Godot project with no game code**
   (a ColorRect + Label) crashed the same way at 23 s under the native GL path
   (`minimal-project-native-crash.log`). Conclusion: the environment, not the game.
4. Stable path found: `LIBGL_ALWAYS_SOFTWARE=1` (Mesa llvmpipe). Minimal project
   survived 50 s (`minimal-project-llvmpipe-50s.log`); the game survived 50 s idle
   (`title-llvmpipe-50s.log`) and completed a 3000-frame chain run at ~136 fps with
   clean scene transitions (`chain-llvmpipe-3000frames.log`).
5. Fix in `tools/demo.sh`: default to software rendering on WSL, opt-out via
   `RZ_GL=hardware`. Re-verified: default survives 30 s (`demo-default-30s.log`);
   capture and smoke modes still work (smoke `state_hash=8fcedb79…` unchanged).
6. Full owner-equivalent session with real mouse input under the fix:
   Start → loadout card → Begin → 4 attacks → victory → result → next encounter →
   in-game Quit, `demo-exit=0` (`owner-flow-mouse-llvmpipe.log`).

## Honesty notes

- The native-path crash is **intermittent**: 3 of 4 native runs crashed (~20 s), one
  survived 30 s (`demo-hardware-flaky-survival.log`). The default avoids the path
  entirely; the opt-out exists only for testing whether WSLg's driver gets fixed.
- PNG pixels differ between renderers; the printed `state_hash` values are the
  renderer-independent artifacts (the smoke hash did not change).
- The earlier "teardown crash" notes in `docs/DEMO.md` (crash when killed after
  ~10 s) remain true in addition to this mid-run crash.
