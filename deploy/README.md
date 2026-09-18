# Staging deploy — laptop builds, remote host runs

Two machines, two jobs:

| Role | Machine | What happens there |
| --- | --- | --- |
| **Build workspace** | this laptop | you edit code, `git commit`, `git push` |
| **Run + test space** | `openclaw` (`77.42.74.141`) | `git pull`, systemd runs the game, nginx exposes it on the internet |

One command moves code from here to there:

```bash
./deploy/deploy.sh
```

It pushes, the remote pulls, services restart, and you get a URL to open in your browser.

---

## Quick start

```bash
cd ~/workspace/gaming

# interactive: asks which app(s) to run, then deploys
./deploy/deploy.sh

# non-interactive
./deploy/deploy.sh --apps=neon-stack
./deploy/deploy.sh --apps=all --yes
```

First run asks once for a **basic-auth username and password** (press Enter at the password prompt to auto-generate a strong one). Only the *hash* is kept, in `.deploy.local` (gitignored, mode 600) — the password itself is never stored anywhere. Change it later with `./deploy/deploy.sh --reset-auth`.

---

## What runs where

```
  LAPTOP                            REMOTE  openclaw / 77.42.74.141
  ──────                            ───────────────────────────────────────────
  git push origin main   ──ssh──▶   /home/gaming        (git clone, reset --hard to origin)
                                    systemd gaming-neon-stack.service    127.0.0.1:9081
                                    systemd gaming-packet-defense.service 127.0.0.1:9082
                                            │
                                    nginx  :8081 ─┘ (public + basic auth)
                                    nginx  :8082 ─┘ (public + basic auth)

  browser  ──▶  http://77.42.74.141:8081/   and   http://77.42.74.141:8082/
```

Games bind to **loopback only**. nginx is the single public entrypoint, so the auth layer can never be bypassed by hitting the Node port directly.

### Port map (remote)

| Port | Owner | Notes |
| --- | --- | --- |
| 80 | `seo-agachi` nginx site | pre-existing — the deploy never touches it |
| 3001 | `seo-agachi` session API | pre-existing |
| 22 | sshd | |
| 8081 | Neon Stack | public, basic auth → `127.0.0.1:9081` |
| 8082 | Packet Defense | public, basic auth → `127.0.0.1:9082` |
| 9081 / 9082 | Node static servers | loopback only |

---

## Commands

| Command | What it does |
| --- | --- |
| `./deploy/deploy.sh` | push → pull → provision → restart → health check |
| `./deploy/deploy.sh --apps=neon-stack` | same, one app only |
| `./deploy/deploy.sh status` | systemd states, enabled nginx sites, listening ports |
| `./deploy/deploy.sh logs neon-stack` | last 60 journal lines for that app |
| `./deploy/deploy.sh restart --apps=all` | restart without deploying code |
| `./deploy/deploy.sh stop --apps=all` | stop the games (nginx will return 502) |
| `./deploy/deploy.sh provision` | re-install units + nginx config only, no code push |
| `./deploy/deploy.sh unprovision` | remove units + nginx blocks |

### Flags

| Flag | Meaning |
| --- | --- |
| `--host=<alias>` | ssh target, default `openclaw` |
| `--apps=<list>` | names or menu numbers, or `all` |
| `--yes` / `-y` | don't ask for confirmation (dirty tree, unprovision) |
| `--no-push` | deploy whatever is already on `origin` |
| `--clean` | also `git clean -fdx` on the remote |
| `--no-auth` | provision publicly, disabling basic auth |
| `--reset-auth` | forget the stored hash and prompt for new credentials |

---

## Files

| Path | Role |
| --- | --- |
| `deploy/deploy.sh` | local orchestrator (interactive) |
| `deploy/apps.conf` | **app + port manifest** — single source of truth |
| `deploy/remote/provision.sh` | runs on the remote; writes systemd units + nginx sites |
| `.deploy.local` | local-only basic-auth hash (gitignored, mode 600) |
| `neon-stack/tools/serve.js`, `packet-defense/tools/serve.js` | honour `HOST` env (loopback vs `0.0.0.0`) |

### Adding a third game

Add one line to `deploy/apps.conf`:

```
my-game | my-game | 9083 | 8083 | My Game
```

Then `./deploy/deploy.sh --apps=my-game`. Nothing else to edit.

---

## Health check output

```
   APP              SERVICE    APP    EDGE
   neon-stack       active     200    401
   packet-defense   active     200    401
```

- `APP` = the Node static server on its loopback port → `200` is healthy.
- `EDGE` = nginx on the public port → `401` means auth is enforced (expected). `200` means no auth. `502` means the app is down.

---

## Troubleshooting

**`[unreachable]` for a public port**
The host itself is fine (the loopback checks pass), so something upstream is blocking. `ufw` on the box is inactive; if a **Hetzner cloud firewall** exists for this server, open the port there too. Also confirm the script's port additions landed: `./deploy/deploy.sh status`.

**`502 Bad Gateway`**
The game process isn't running: `./deploy/deploy.sh logs <app>`, then `./deploy/deploy.sh restart --apps=<app>`.

**Dirty-working-tree warning during deploy**
Expected and important: this mode deploys `origin/main`, so uncommitted edits are **not** shipped. Commit (or stash) first, or accept the prompt to deploy committed code only.

**`ssh: connection refused`**
The script targets the `openclaw` alias from `~/.ssh/config`. Override with `--host=user@ip` or `DEPLOY_HOST=...` if that changes.

**Lost the password**
Nothing can recover it (only the hash exists). Run `./deploy/deploy.sh --reset-auth` to set a new one.

**The remote repo drifted** (manual edits on the server)
`deploy.sh` runs `git reset --hard origin/<branch>`, so remote-side edits are discarded on the next deploy — treat the remote as disposable. `--clean` additionally removes untracked/ignored files.
