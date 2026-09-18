# Towers: what exists, and what is queued

## Shipped

Seven types can be in the palette at once, and that is a hard layout limit rather
than a design choice — see `PALETTE_MAX` in `engine.js`. The arithmetic: at the
narrowest world width (620 units) seven cards at the 44-unit floor plus six
5-unit gaps is 338; the side panels cannot go below 104 + 132; padding and gaps
take 40 more. 614 of 620. An eighth card overflows the strip and pushes the
wave/pause column off the right edge.

| id | Name | Cost | Role | Available |
|---|---|---|---|---|
| `firewall` | Firewall | 60 | Fast single target, anti-swarm, weak to injection | start |
| `cdn` | **CDN Edge** | 75 | Very fast, very short range, anti-swarm | **start (new)** |
| `waf` | WAF | 110 | Splash, anti-injection | start |
| `limiter` | Rate Limiter | 85 | No damage; slows everything in range | start |
| `av` | Antivirus | 150 | Long range, heavy, anti-malware | start |
| `honeypot` | Honeypot | 70 | No damage; marks nearby threats to take more and pay double | 180 credits |
| `patch` | Patch Queue | 130 | No damage; repairs PROD integrity | 240 credits |

Every type has two paid upgrades (level 1 → 3). Upgrades scale damage and range
(and the support towers' own effect); **fire rate is never upgradable**, on
purpose: a tower whose rate can be bought eventually replaces every other damage
tower, and the design depends on each type being wrong for some wave.

Sell refunds 60% of everything actually paid, including upgrades.

### CDN Edge — why this one first

The four starting damage/support towers all have a class they are bad against,
which is what makes the briefing matter. But `firewall` (the only cheap damage
tower) is bad against injection and mediocre against malware, and `waf`/`av` are
both expensive. That left the opening acts with a choice between one cheap tower
and two unaffordable ones.

CDN Edge fills it: 3 damage at 0.16s is 18.75 dps against code, which beats a
Firewall's 14 for 15 more credits — but only 76 range against the Firewall's 96,
so it needs the road to bend back on itself to be worth it. It rewards the
placement skill the game is already teaching, and it is a *worse* tower than a
Firewall on a long straight.

## Queued (defined, not yet sold)

`quarantine` is defined in `towers.js` and deliberately left out of `ORDER` and
out of `Base.UNLOCKS`. It is not dead code and it is not a bug: it is the next
type in the queue, and it is waiting on the palette gaining a second row.

Shipping it as payable content today would be worse than not shipping it —
`paletteIds()` slices to `PALETTE_MAX`, so a player could spend 300 credits on a
tower that the HUD then trims out of the palette and can never build.

**Quarantine** — 210 credits, 38 damage, 1.9s, splash 34, range 118,
malware ×2.0. The answer to a pack of Ransomware: slow, enormous splash, and
useless against a swarm of one-hit drones.

## What a second palette row would unlock

These are designed against the existing stat model (`damage`, `range`, `rate`,
`splash`, `slow`, `tag`, `tagBounty`, `heal`, `bonus` by class) — all of them are
pure data, no engine work, once there is room for them:

| Proposed id | Name | Idea | Needs |
|---|---|---|---|
| `quarantine` | Quarantine | Heavy splash, malware answer | palette row |
| `ids` | IDS Sensor | Long range, no weakness — a generalist for players who would rather not counter-pick. Deliberately mediocre at everything | palette row |
| `rollback` | Rollback Point | Cheaper, weaker `patch` — heals 0.3/s for 90 credits so healing exists before act 6 | palette row |
| `sinkhole` | Sinkhole | Deals no damage; `tag` ×1.6 but no bounty — an amplifier that costs more than a Honeypot and does not pay for itself in credits | palette row |
| `ratelimit-edge` | Edge Limiter | Weaker slow (0.7) over a much larger radius — the "wide but gentle" counterpart to the Rate Limiter | palette row |
| `warm-standby` | Warm Standby | Upgrades adjacent towers rather than dealing damage itself | engine work |

## The rule for adding a type

1. It must be **wrong for some wave**. A type that is simply better than an
   existing one is not content; it is a reason the existing one was wasted
   credits — and every type in the shop has to stay worth its cost.
2. It must have a **blurb that tells the truth**, because `towers.js` blurbs are
   rendered verbatim on the BASE screen and the shop is where players decide.
3. Its `upgrade` block must leave **rate untouched**.
4. Add the id to `ORDER` in `towers.js` **and** to `FREE` or `UNLOCKS` in
   `base.js` — a type in `ORDER` but in neither list is silently always
   available (`towerUnlocked()` fails open by design).
5. Check the palette still fits: `node tools/balance.js --levels 1-1` and then
   confirm the card count in the browser. `PALETTE_MAX` will trim silently, which
   is exactly the failure this document exists to prevent.
