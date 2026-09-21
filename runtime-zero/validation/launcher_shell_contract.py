"""Check Bash/zsh PATH normalization without changing HOME or installed tools.

Run from runtime-zero/: python3 validation/launcher_shell_contract.py
Only literal $HOME references in a disposable copy of env.sh are substituted.
Labelled executable stubs test path handling, not real tool installations.
"""
from pathlib import Path
import os
import shutil
import subprocess
import tempfile

root = Path(__file__).resolve().parents[1]
source = (root / "tools/env.sh").read_text()
failures = 0
with tempfile.TemporaryDirectory(prefix="rz-shell-") as directory:
    fixture = Path(directory)
    node = fixture / ".nvm/versions/node/v22.23.2/bin"
    local = fixture / ".local/bin"
    other = fixture / "other directory/bin"
    other.mkdir(parents=True)
    for folder, names in [(node, ["node"]), (local, ["uv", "godot"])]:
        folder.mkdir(parents=True, exist_ok=True)
        for name in names:
            target = folder / name
            target.write_text("#!/bin/sh\nexit 0\n")
            target.chmod(0o700)
    script = fixture / "env-fixture.sh"
    script.write_text(source.replace("$HOME", str(fixture)))
    expected = f"{node}:{local}:{other}:/usr/bin:/bin"
    inherited = f"{other}:{local}:/usr/bin:{node}:/bin:{local}"
    command = (
        f'. "{script}" || exit $?; printf "%s\\n" "$PATH"; '
        f'. "{script}" || exit $?; printf "%s\\n" "$PATH"'
    )
    for shell, options in [("bash", ["--noprofile", "--norc"]), ("zsh", ["-f"])]:
        executable = shutil.which(shell)
        if executable is None:
            print(f"UNVERIFIED: {shell} missing; both documented shells are required")
            failures += 1
            continue
        result = subprocess.run([executable, *options, "-c", command],
                                env=dict(os.environ, PATH=inherited),
                                capture_output=True, text=True)
        observed = result.stdout.splitlines()
        passed = result.returncode == 0 and observed == [expected, expected]
        failures += not passed
        print("PASS" if passed else "FAIL", shell,
              "selected entries occur once; other entries/spaces preserved; repeat stable")
        print("expected each activation:", expected.replace(str(fixture), "<FIXTURE>"))
        for index, path in enumerate(observed, 1):
            print(f"activation {index}:", path.replace(str(fixture), "<FIXTURE>"))
        if result.stderr:
            print(result.stderr.replace(str(fixture), "<FIXTURE>"))
raise SystemExit(1 if failures else 0)
