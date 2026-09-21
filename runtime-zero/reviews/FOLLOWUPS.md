# Nonblocking follow-ups

These items do not hold implementation tickets. Pick them up when changing the affected component or during a chosen maintenance batch; do not stop eligible gameplay to resolve them. Required correctness and owner decision gates remain in registered review records/backlog dependencies.

## NB-001 — normalize repeated zsh activation

- Status: open, nonblocking maintenance.
- Origin: RV-001 V-002; reports/validation-001-retry.md.
- Observed impact: selected Node, uv and Godot resolve correctly, but repeated activation retains/adds duplicate selected PATH entries in zsh. No observed failure prevents RZ-006 content work.
- Workaround: use the verified toolchain route; a fresh terminal avoids accumulated duplicates. No requirement to change global shell configuration.
- Revisit: the next change to tools/env.sh or a chosen toolchain-maintenance batch. Do not make this a dependency of RPG content/UI implementation.
- Fix direction: explicit colon-delimited parsing compatible with Bash and zsh, preserving unrelated entries/spaces and avoiding caller-wide shell-option changes.
- Focused verification: validation/launcher_contract.py and validation/launcher_shell_contract.py. Existing Bash/zsh failure evidence is retained; the waiver does not relabel it as passing.

The remaining V-002 review gate was explicitly waived on Housseyn's direction to keep achievable work moving. No further RV-001 correction/evidence submission is required before RZ-006. Future code still receives proportionate review under reviews/README.md.
