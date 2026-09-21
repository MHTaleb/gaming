# RZ-011 — root CI workflow evidence

The workflow file lives at the **repository root** (one level above this project):

    gaming/.github/workflows/runtime-zero-game.yml

It cannot be referenced directly from `backlog/backlog.json` evidence, because the
specification verifier (`tools/verify.js`) requires every referenced artifact to live
inside `runtime-zero/`. This note is the in-tree record of that file.

- sha256 of `.github/workflows/runtime-zero-game.yml` at RZ-011: `a52ea0407e7bc42b3f702b23c5c2389e972838c0704a5309a289c1fc1994344a`
- YAML parses: `python3 -c "import yaml; yaml.safe_load(...)"` → OK (2026-09-21)
- Engine pin: Godot 4.7.2-stable linux x86_64 zip from the official GitHub release,
  sha512 `9aa00f7a605200940bce3027a567b782f49bd8e940dd06ae9e987bd65aee1b1467edd56ed84fcdcbdd44354bf613bdbb4e5d2913e925850368e150c59ed54c65`
  — the same value recorded in `config/toolchain.lock.json`; the workflow verifies it
  with `sha512sum -c -` before executing the binary.
- What it runs, in order: project import (`--editor --quit`), then
  `run_tests.gd`, `content_tests.gd`, `presentation_tests.gd`, `run_flow_tests.gd`,
  `save_tests.gd`, `feedback_tests.gd`, `replay_tests.gd`, the independent
  `validation/guard_contract.gd`, and finally `node tools/verify.js`.
- Constraints honoured (docs/TESTING.md "CI"): no GPU, no paid APIs, no secrets, no
  model downloads. The engine zip is the only network fetch.
- GitHub Actions cannot be executed locally. The local run of the *identical command
  sequence* is captured in `battery.log` (all exit 0). The Actions run itself is only
  observable after the commit is pushed; the workflow also triggers on
  `workflow_dispatch` so the owner can launch it from the Actions tab once pushed.
