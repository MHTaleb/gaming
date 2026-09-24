# MCP_SETUP.md — AI toolchain: what is installed, how it's wired, how to verify

> Principle: **official first**, reputable maintained open-source second, pinned versions where practical.
> Every server below was checked against its upstream docs on **2026-09-24**; sources are listed so the
> claim is auditable. Nothing here is activated without you: activations that need logins/clicks are marked
> **USER ACTION REQUIRED**.

## Installed / configured summary

| Server | Source (verified) | Version | Install state | Activation |
| --- | --- | --- | --- | --- |
| **unity-mcp** | `CoplayDev/unity-mcp` (MIT, 14k★, sponsored by Aura) — no official Unity editor MCP exists (Unity's `industry-ai-workflows` is enterprise/industry-only) | **v10.2.0** (2026-09-01) | server command configured; Unity package **not yet installed** (needs editor) | **USER ACTION** — in Unity: add package, run wizard |
| **blender-mcp** | `ahujasid/mcp-for-blender` (MIT, ~29k★) — no official Blender Foundation MCP exists | **v2.0.4** (PyPI `mcp-for-blender`) | ✅ server installed via `uv tool install mcp-for-blender` | **USER ACTION** — install addon in Blender, click "Connect" |
| **meshy** | `meshy-dev/meshy-mcp-server` — **official Meshy org** (MIT) | **v0.5.2** (npm `@meshy-ai/meshy-mcp-server`) | config ready; runs via npx on demand | **USER ACTION** — provide API key (VS Code will prompt) |

Config lives in **`.vscode/mcp.json`** (workspace-level, secrets via `${input:...}` prompts — no keys on disk).

## 1. Unity MCP (MCP for Unity v10.2.0)

Server side is already wired in `.vscode/mcp.json` (pinned to the `v10.2.0` tag):

```json
"unity-mcp": {
  "type": "stdio",
  "command": "<HOME>/.local/bin/uvx",
  "args": ["--from", "git+https://github.com/CoplayDev/unity-mcp@v10.2.0#subdirectory=Server", "mcp-for-unity", "--transport", "stdio"]
}
```

**USER ACTION REQUIRED** (needs the Unity editor — one-time setup):

1. In Unity: `Window ▸ Package Manager ▸ + ▸ Add package from git URL…`
   `https://github.com/CoplayDev/unity-mcp.git?path=/MCPForUnity#v10.2.0`
2. `Window ▸ MCP for Unity ▸ Configure All Detected Clients` → it writes/refreshes the client config itself
   (this is the officially supported path; if it rewrites `.vscode/mcp.json`, accept its output).
3. Ensure the editor is running when you use the tools (the server connects to the editor, not vice versa).
4. Verify from VS Code: `MCP: List Servers` → `unity-mcp` → Start; then ask: *"read the Unity console"*.

Security notes: the Unity package exposes editor automation over a local bridge. Keep it for local use;
do not expose the bridge port beyond localhost. Reviewed: MIT license, no telemetry beyond anonymous
update checks; the server runs locally from a pinned tag.

## 2. Blender MCP

```json
"blender-mcp": { "type": "stdio", "command": "<HOME>/.local/bin/uvx", "args": ["mcp-for-blender"] }
```

**USER ACTION REQUIRED** (one-time, in Blender 5.2.2 — installed at `~/apps/blender-5.2.2-linux-x64/blender`):

1. Download the addon from the repo: `https://github.com/ahujasid/mcp-for-blender` (folder `addon/`).
2. Blender ▸ Edit ▸ Preferences ▸ Add-ons ▸ Install… → select the addon zip/py → enable **"Blender MCP"**.
3. Open the 3D viewport's sidebar (N) → **BlenderMCP** tab → *Start MCP Server* (listens on `localhost:9876`).
4. In VS Code: `MCP: List Servers` → `blender-mcp` → Start; verify: *"list the objects in the Blender scene"*.

Security notes: the addon executes `bpy` operations requested by the client over a **local websocket**;
it deliberately blocks arbitrary `execute_code` by default depending on version — keep it localhost-only,
never start the server on an untrusted network, and review suspicious requests before approving.

## 3. Meshy MCP (official)

```json
"meshy": {
  "type": "stdio",
  "command": "npx",
  "args": ["-y", "@meshy-ai/meshy-mcp-server"],
  "env": { "MESHY_API_KEY": "${input:meshy-api-key}" }
}
```

**USER ACTION REQUIRED**:

1. Get an API key: `https://www.meshy.ai/settings/api` (requires a paid plan).
2. First time VS Code starts the server it will prompt for the key (stored by VS Code, not by this repo).
3. **Credits are money.** Per project rule (`AGENTS.md`): no generation without your explicit approval;
   each task's credit cost is documented in the Meshy README (e.g. text-to-3D refine, rigging, etc.).

## 4. Verification (offline)

```bash
./scripts/verify-mcp.sh
```
Checks: `uvx` resolves, `mcp-for-blender` tool is installed, `@meshy-ai/meshy-mcp-server` is resolvable via
npm registry, and the Unity pinned tag is fetchable. It does **not** prove live connectivity — that requires
Unity/Blender running + a key (see USER ACTION steps above).

## 5. What was deliberately NOT installed

- **Unity Hub**: not needed for the CLI workflow; add later for GUI convenience (module management is easier with it).
- **Docker-based MCP servers**: unnecessary local complexity for one dev.
- **Community Meshy forks / unknown MCP servers**: rejected — official source exists (security rule: prefer first-party).
- **Unity `industry-ai-workflows`**: official but enterprise/industry-pipeline focused; does not fit editor automation here.

## 6. Security summary (audit trail)

| Server | Origin | License | Runs as | Privileges |
| --- | --- | --- | --- | --- |
| unity-mcp | github.com/CoplayDev/unity-mcp @ v10.2.0 | MIT | local `uvx` process ↔ editor bridge | full editor automation (like a plugin) — treat like any editor plugin |
| blender-mcp | github.com/ahujasid/mcp-for-blender @ 2.0.4 | MIT | local `uvx` process ↔ Blender addon websocket | full `bpy` access while server is ON |
| meshy | github.com/meshy-dev/meshy-mcp-server @ 0.5.2 | MIT | local npx process ↔ api.meshy.ai | API-scoped; spends credits |

Keys: only `MESHY_API_KEY`, only via VS Code prompt / `.env` (gitignored). Never committed. Reviewed 2026-09-24.
