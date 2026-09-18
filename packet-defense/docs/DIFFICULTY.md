# Difficulty tiers: the dials, and what they actually measure

Five readings of the same two hundred and forty tickets. The campaign is generated
from the ticket number alone, so a difficulty setting cannot mean *different*
levels — it means the same level asked a different question.

| Tier | Mass (how many) | Health | Speed | Armour | Spawn gap | `lean` (money per threat) | Payout |
|---|---|---|---|---|---|---|---|
| Easy | ×0.65 | ×0.85 | ×0.93 | ×0.60 | ×1.25 | ×1.15 | ×0.7 |
| **Normal** | ×1 | ×1 | ×1 | ×1 | ×1 | ×1 | ×1 |
| Hard | ×1.20 | ×1.00 | ×1.03 | ×1.25 | ×0.95 | ×0.97 | ×1.45 |
| Hell | ×1.45 | ×1.00 | ×1.11 | ×1.65 | ×0.80 | ×0.93 | ×2.0 |
| Insane | ×1.75 | ×1.02 | ×1.18 | ×2.10 | ×0.70 | ×0.90 | ×2.8 |

**`mass` is the dial that says how many of them there are**, and it is the one that
was missing. Until it existed the tiers only made each enemy tougher, which is
the exact mistake `campaign.js`'s own header calls out — *"scaling hit points and
calling it difficulty; that just makes the same fight take longer"*. Measured
before the change, easy and insane sent an **identical 29,594 threats** across the
campaign: a single-target tower could not tell the two tiers apart, and they
differed only in how long each enemy took to die.

`lean` is the money handed out per unit of threat, and it is the dial that forces
better placement rather than a longer fight.

Health therefore stays near ×1 on every tier: a body on insane is about as tough
as a body on normal. There are just far more of them.

### Why the bandwidth has to rise with the count

Bandwidth is `mass × lean`, and that is forced rather than chosen. The wave
composer spends its **entire** budget, so total threat power *is* the budget.
Raising the count while holding the budget flat would have to come out of
per-enemy health — and `(budget / health) × health = budget`, so the ticket would
get no harder, only flatter. A harder tier showing a bigger bandwidth number is
correct here: there is more to kill.

Two things made this dial genuinely awkward to land, and both are now fixed in
`campaign.js`:

1. **The composer targets body power, not bandwidth.** Setting a tier's
   bandwidth does nothing to the count — the count decides the bandwidth, not the
   other way round. `wavesFor` scales its target by `mass`.
2. **The count caps are the real ceiling.** A tier with a bigger budget but the
   same caps simply saturates every group and spills the surplus into health.
   Measured with the caps unscaled, insane ended up with *fewer* bodies than easy:
   the flood tier was simultaneously the tankiest and the sparsest. `composeWave`
   now scales `countCap` by `mass` too.

## Normal is the reference

Every normal multiplier is exactly 1, so normal is bit-for-bit the campaign the
generator has always produced, and `tools/balance.js` still means what it always
meant. **If a tier's numbers look wrong, normal is the control.** Any change that
makes normal's output differ is a bug, not a tuning choice.

## Measured

### How the tiers scale

Measured across all 240 tickets via `Levels.at(id, tier)`:

| Tier | Total threat power | Total threats | Power vs normal | Threats vs normal |
|---|---|---|---|---|
| Easy | 1,700,037 | 24,280 | ×0.64 | ×0.82 |
| Normal | 2,671,805 | 29,594 | ×1.00 | ×1.00 |
| Hard | 3,156,976 | 34,097 | ×1.18 | ×1.15 |
| Hell | 3,705,205 | 37,954 | ×1.39 | ×1.28 |
| Insane | 4,521,690 | 41,902 | ×1.69 | ×1.42 |

**Easy → insane: power ×2.66, threats ×1.73**, both monotonic. Per ticket it is
plainer — ticket 1 is 13 threats / 249 power on easy against 24 threats / 564
power on insane; ticket 240 is 160 threats / 13,362 power against 223 / 35,167.

The threat spread is 1.73× rather than the 2.69× that `mass` implies on its own,
because the count caps still bind on the busiest tickets and the remainder becomes
health by design. That is the honest measured number, not the dial's nominal value.

### Clear rates

**Pending re-measurement.** The table above changed what the tiers *are*, so the
previous figures (hell 224/240, insane 186/240) no longer describe this build and
are not quoted here rather than repeated out of date. The runs are in flight.

Normal needs no re-measurement and is confirmed unchanged in composition:
identical per-act power and identical clears (240/240). Its star line moved from
237 to 238 three-star, which is not a tier effect — it is the new **CDN Edge**
tower changing what the harness bot chooses to build.

Invariants hold on all five tiers, re-checked after the change.

### What this does and does not prove

- **Normal is proven playable end to end**: 240/240, 0 failures, 0 invariant
  problems, confirmed unchanged in composition after the mass change. That is the
  claim that matters for shipping, and it is the tier every player starts on.
- **The other four tiers are being re-measured.** Any clear-rate claim about them
  in this file would be describing a build that no longer exists, so there are
  none here until the runs land.
- **A bot failure is not a broken ticket.** The harness bot never calls a wave
  early, so it is a lower bound rather than an average player. A loss is evidence
  the tier is hard; it is not evidence the ticket is impossible.

## The one finding worth acting on

> Measured against the **previous** tier tuning (health-scaled, before `mass`).
> The tickets are worth re-checking once the re-measurement lands, because the
> tiers changed underneath them — the four failing acts may well have moved.

Twelve tickets failed at **hell** as well as insane:

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
