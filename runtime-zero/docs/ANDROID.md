# Android debug build orders

Implement RZ-026 after the desktop slice passes owner review. Use Godot's export system; do not copy sibling Capacitor projects.

1. Read the Android export documentation for the exact pinned Godot release. Install the required JDK, SDK command-line tools, platform/build-tools and matching Godot export templates. Verify paths and versions in the same environment that runs the exporter. Do not infer current SDK requirements from an old guide.
2. Handle Android SDK license acceptance through Housseyn where required. Keep SDK tools outside Git. Record installed package versions and tested environment in the toolchain lock.
3. Create `game/export_presets.cfg` with a debug preset named `Android`. Use a provisional package ID only for local debug, record it, and obtain the final identifier before any public release. Keep passwords, release keys and export credentials out of Git.
4. Implement a wrapper that imports the project, creates the output directory and uses an absolute output path with `godot --headless --path game --export-debug Android <absolute-project-build-path>/runtime-zero-debug.apk`. Log exit status and hash the APK. The preset must exist before calling this command.
5. Use only an explicitly selected/authorized Android device. Check `adb devices`, have Housseyn approve device debugging if needed, then install the debug APK, launch and collect bounded sanitized logs. If multiple devices exist, select one explicitly. An emulator check does not replace physical-device QA.
6. Verify launch, loadout, combat, retry, settings, save persistence, pause/background/resume, touch and audio. Measure frame time and memory on the actual target. Ensure no AI model/backend is bundled or contacted by gameplay.

RZ-027 records device/build/version and observed results. RZ-028 produces a playable vertical-slice handoff. AAB/release signing, Play account configuration, store policy review, privacy disclosures and publication require later explicit release scope. Recheck current official requirements at that time; no deployment is part of this specification.
