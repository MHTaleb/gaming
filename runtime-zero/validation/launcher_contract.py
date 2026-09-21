"""Check launcher precedence without changing HOME or installing host tools.

Run from runtime-zero/: python validation/launcher_contract.py
Copies env.sh into a disposable fixture, replacing only its literal $HOME path
references with a fixture directory. Executables are labelled shell stubs;
this tests PATH selection, never installation or real tool functionality.
"""
from pathlib import Path
import os
import subprocess
import tempfile

root = Path(__file__).resolve().parents[1]
source = (root / "tools/env.sh").read_text()
failures = 0
with tempfile.TemporaryDirectory(prefix="rz-launcher-") as directory:
    fixture = Path(directory)
    node = fixture / ".nvm/versions/node/v22.23.2/bin"
    local = fixture / ".local/bin"
    other = fixture / "other/bin"
    for folder, names, label in [
        (node, ["node"], "selected-node"),
        (local, ["uv", "godot"], "selected-tool"),
        (other, ["uv", "godot"], "competing-tool"),
    ]:
        folder.mkdir(parents=True, exist_ok=True)
        for name in names:
            path = folder / name
            path.write_text("#!/bin/sh\nprintf '%s\\n' '" + label + "'\n")
            path.chmod(0o700)
    script = fixture / "env-fixture.sh"
    script.write_text(source.replace("$HOME", str(fixture)))
    # Existing ~/.local/bin after another installation must still be promoted.
    env = dict(os.environ, PATH=f"{other}:{local}:/usr/bin:/bin")
    command = f'. "{script}" && command -v godot && command -v uv'
    result = subprocess.run(["/bin/bash", "--noprofile", "--norc", "-c", command],
                            env=env, capture_output=True, text=True)
    observed = result.stdout.strip().splitlines()
    expected = [str(local / "godot"), str(local / "uv")]
    passed = result.returncode == 0 and observed == expected
    failures += not passed
    print("PASS" if passed else "FAIL", "existing user bin must win over competing tools")
    print("expected:", [p.replace(str(fixture), "<FIXTURE>") for p in expected])
    print("observed:", [p.replace(str(fixture), "<FIXTURE>") for p in observed])
    # A user-bin node must not shadow the chosen nvm Node on first activation.
    (local / "node").write_text("#!/bin/sh\nprintf '%s\\n' 'stale-node'\n")
    (local / "node").chmod(0o700)
    env = dict(os.environ, PATH="/usr/bin:/bin")
    command = f'. "{script}" && command -v node; . "{script}" && command -v node'
    result = subprocess.run(["/bin/bash", "--noprofile", "--norc", "-c", command],
                            env=env, capture_output=True, text=True)
    observed = result.stdout.strip().splitlines()
    expected = [str(node / "node")] * 2
    passed = result.returncode == 0 and observed == expected
    failures += not passed
    print("PASS" if passed else "FAIL", "selected Node wins on first and repeated activation")
    print("expected:", [p.replace(str(fixture), "<FIXTURE>") for p in expected])
    print("observed:", [p.replace(str(fixture), "<FIXTURE>") for p in observed])
raise SystemExit(1 if failures else 0)
