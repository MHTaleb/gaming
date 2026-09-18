# Difficulty tiers: the dials, and what they actually measure

Five readings of the same two hundred and forty tickets. The campaign is generated
from the ticket number alone, so a difficulty setting cannot mean *different*
levels — it means the same level asked a different question.

| Tier | Health | Speed | Armour | Spawn gap | Budget | Payout |
|---|---|---|---|---|---|---|
| Easy | ×0.78 | ×0.93 | ×0.60 | ×1.25 | ×1.28 | ×0.7 |
| **Normal** | ×1 | ×1 | ×1 | ×1 | ×1 | ×1 |
| Hard | ×1.14 | ×1.03 | ×1.25 | ×0.95 | ×0.94 | ×1.45 |
| Hell | ×1.46 | ×1.11 | ×1.65 | ×0.80 | ×0.86 | ×2.0 |
| Insane | ×1.80 | ×1.18 | ×2.10 | ×0.70 | ×0.79 | ×2.8 |

`budget` is inverted on purpose: a harder tier hands you **less** bandwidth
against the same threat. That forces tighter placement rather than a longer
fight, and it is why hard's identity is the economy rather than bigger numbers —
an earlier cut ran hard at health ×1.20 / gap ×0.90 and ticket 124 leaked
thirteen threats through seventy-five towers.

## Normal is the reference

Every normal multiplier is exactly 1, so normal is bit-for-bit the campaign the
generator has always produced, and `tools/balance.js` still means what it always
meant. **If a tier's numbers look wrong, normal is the control.** Any change that
makes normal's output differ is a bug, not a tuning choice.

## Measured

Full campaign, the harness bot, `node tools/balance.js --tier <id>`. The bot
never calls a wave early, which forgoes the early bonus — it is a **lower bound**
on a competent player, not an average one.

| Tier | Cleared | ★★★ | ★★ | ★ | Failed | Invariants |
|---|---|---|---|---|---|---|
| Easy | 240/240 | 240 | 0 | 0 | 0 | hold |
| Normal | 240/240 | 237 | 3 | 0 | 0 | hold |
| Hard | 240/240 | 208 | 15 | 17 | 0 | hold |
| Hell | 224/240 | 131 | 15 | 78 | 16 | hold |
| Insane | 186/240 | 99 | 16 | 71 | 54 | hold |

Read down the ★★★ column: 100% → 99% → 87% → 55% → 41%. That is the curve doing
its job — each tier costs the player margin rather than adding hit points to the
same experience.

### What this does and does not prove

- **Every ticket is playable.** Proven, not assumed: easy, normal and hard all
  clear 240/240 with zero failures, so nothing in the campaign is structurally
  broken. This is the claim that matters for shipping.
- **Hell and insane are not fully clearable by the reference bot** (16 and 54
  losses). The bot is a lower bound, so these are not proof of impossibility —
  but they are also not proof of winnability, and that distinction is worth
  keeping.
- Insane costing 22% of tickets to a bot that plays near-optimally is the
  intended shape of a tier called *insane*. It is opt-in and it is not on the
  path to finishing the campaign.

## The one finding worth acting on

Twelve tickets fail at **hell** as well as insane:

```
#124 #125 #126 #129 #131   (act 7, Backbone)
#190 #201 #204
#221 #222 #223 #224        (act 12, The Last Commit)
```

Act 7 is the outlier: 14 of insane's 54 losses are in its twenty tickets. These
are not tier-scaling casualties — they fail *even at hell*, which means the base
ticket is the problem, not the multiplier.

The mechanism, from `--level 124`: a switchback with **26 tiles and only 4 twin
tiles** (the hardest geometry the road scorer will hand out) carrying **all four
traits at once** — hardened, swift, regenerating, reviving. Act 7 is where the
fourth trait enters, and the within-act road walk reaches its hardest roads at
the same time, so the two dials peak together instead of in sequence.

Nothing here is broken; it is two difficulty dials resonating. The fix would be
to stagger them — hold the trait set one ticket shorter in the act that
introduces a trait, or floor the road quality on that act's tickets. It is not
done here because any change to the curve invalidates all five measurements
above, and re-running them costs roughly an hour and a half of wall clock. Worth
doing deliberately, with the re-measurement budgeted.

## Reproducing

```bash
node tools/balance.js --tier insane            # full campaign, ~15-25 min
node tools/balance.js --level 124 --tier hell  # one ticket, wave by wave
node tools/balance.js --levels 1-1 --tier X    # every invariant, one ticket played
node tools/balance.js --check                  # exit non-zero if an invariant fails
```

Invariants are asserted **per tier**, because a tier multiplies health, speed and
armour and `power()` is not linear in those — a tier can be flat where normal is
rising. All five currently hold.

## Two invariants to preserve

1. **Monotonicity.** `applyPowerFloor` in `campaign.js` scales wave health until
   each ticket measures above its predecessor. It runs **per tier**, because a
   finale's boss carries a large solved health multiplier and so scales harder
   than the body ticket after it — normal's repair is simply too small at hard and
   above. Its target carries a 0.2% margin because `power()` rounds to an integer
   and the hp multipliers are stored rounded: aiming at the predecessor plus one
   lands *inside* the rounding noise and misses.
2. **The palette holds seven.** Unrelated to difficulty, but it bounds how many
   tower types can exist. See `docs/TOWERS.md`.
