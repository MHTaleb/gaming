# The backlog

The plan for this project, as data.

**`backlog.json` is the single source of truth for what is done, in progress and
planned.** The documents in `docs/` reference these items by id. If a document and
the JSON ever disagree, the JSON is right.

---

## Using it

```bash
node tools/backlog.js              # validate. exits non-zero on any problem
node tools/backlog.js --summary    # progress by status
node tools/backlog.js --ready      # what to pick up next, best first
node tools/backlog.js --json       # machine-readable, for CI or a diff

node tools/serve.js                # then open http://localhost:8080/backlog/
```

The board reads the JSON directly and **writes nothing back**. The file is edited
in an editor and reviewed like code, which is the point: a board that can silently
mutate the plan is a board nobody can trust, and the reason the backlog is data is
so that it can be validated and diffed.

### Why it is not in `www/`

`www/` is the Capacitor `webDir`: everything inside it ships inside the APK. A
plan, a list of what is broken, and a record of what the game does not do yet are
not things a player should download. Serving it from the project root keeps it out
of the bundle by construction rather than by remembering to exclude it.

---

## Shape of the file

```jsonc
{
  "meta":      { /* enums, how to use, the scoring formula */ },
  "epics":     [ { "id", "title", "area", "blurb" } ],
  "research":  [ { "id", "topic", "finding", "source", "sourceDate",
                   "readOn", "impact", "items" } ],
  "items":     [ /* the work */ ]
}
```

### An item

```jsonc
{
  "id":       "PD-302",
  "title":    "Make a crash visible instead of silent",
  "epic":     "E-ENG",             // which epic it belongs to
  "area":     "tech",              // which part of the project it touches
  "type":     "bug",               // story | task | bug | spike | chore
  "status":   "next",              // done | doing | next | blocked | later | dropped
  "priority": "P0",                // P0 | P1 | P2 | P3
  "size":     "S",                 // S | M | L | XL
  "value":    5,                   // 1-5, how much this is worth shipping
  "risk":     1,                   // 1-5, how likely it is to go wrong

  "summary":  "one or two sentences: what needs doing",
  "why":      "why it matters - the argument, not a restatement",

  "dod":      ["definition of done, as testable statements"],
  "deps":     ["PD-303"],          // must itself be done first
  "blockedBy": "Requires Play Console access.",
  "riskNote": "what is likely to go wrong, and what it costs",
  "refs":     ["www/js/engine.js"],// where in the repository
  "sources":  ["R-05"],            // which research produced this
  "tags":     ["robustness", "lesson"]
}
```

Every field except `summary`, `status`, `priority`, `size`, `type` and `area` is
optional. Prefer short and specific over complete.

### Ids

Numbered by area so the board sorts sensibly and a glance at an id says what kind
of work it is:

| Range | Area |
|---|---|
| `PD-0xx` | Done — shipped in 1.0.0 |
| `PD-1xx` | Google Play readiness |
| `PD-2xx` | Gameplay, depth and co-op features |
| `PD-3xx` | Engineering, performance, tooling |
| `PD-4xx` | Art, audio and store assets |
| `PD-5xx` | *(reserved)* |
| `PD-6xx` | Monetisation and live operations |
| `PD-7xx` | Documentation |
| `PD-8xx` | Verification, QA and devices |

### Research entries

A finding is recorded with its **source, the date the source was published and the
date it was read**, plus the `items` it produced. Both directions of the chain are
traceable: an item cites the `R-xx` that produced it, and the finding lists the
items it created.

This is not bureaucracy. `docs/PUBLISHING.md` asserted that Capacitor 7's
`targetSdk 35` met Play's requirement and that no action was needed. That was true
when it was written and became false on a date that nothing recorded, and it was
the only reason nobody checked. See **R-01** and **PD-102**.

A finding that could not be verified is recorded as `"source": "unverified"` with a
`caveat`, rather than being omitted or stated as fact. **R-08** is one of these.

---

## Statuses

| Status | Meaning |
|---|---|
| `done` | Built, verified and committed. **Verified means a command was run**, not that it looks right. |
| `doing` | Actively in progress now. |
| `next` | Ready to start. Not blocked, and the next thing that should be picked up. |
| `later` | Real and agreed, but not scheduled. The default resting place. |
| `blocked` | Cannot start or finish until something outside our control happens. Must say what, in `blockedBy`. |
| `dropped` | Decided against. Kept so the decision is not relitigated. Must say why. |

---

## Validation

`node tools/backlog.js` fails on:

* a duplicate id
* an unknown value in any enum
* a dependency on an item that does not exist
* **an item marked `done` whose dependency is not done** — the one inconsistency
  that makes a plan actively misleading
* two items that depend on each other
* a `blocked` item that does not say what is blocking it
* research that cites an item that does not exist, or an item citing research that
  does not exist

It warns, without failing, when a `dropped` item does not record why.

The validator caught three real errors the first time it was run — prose in a
field that was supposed to hold a number, and a blocked item with no stated
blocker. That is the argument for having one.

---

## Ordering

Within a column the board sorts by:

```
rank = value × 2 − risk × 1.5 + priorityBonus(P0 +9, P1 +5, P2 +2, P3 0)
```

Value counts double because the point is to build the thing worth playing; risk is
subtracted because an item likely to go wrong costs more than its size suggests;
the priority bonus is large enough to outrank almost any value difference, because
a P0 blocker is not a preference. It is a conversation starter, not a verdict.

---

## Conventions

1. **An item describes an outcome, not a technique.** "Co-op players can rejoin
   after closing the app", not "add a snapshot request message".
2. **`why` is an argument.** If it only restates `summary`, delete it.
3. **`dod` should be testable.** "Difficulty is still monotonic on all five tiers"
   is testable. "The balance is good" is not.
4. **Cite the research.** If a finding drove the item, `sources` must say so.
5. **A measurement in the summary is worth ten adjectives.** The existing items
   quote real numbers — "three seats spent 13,286 of 34,038" — because that is what
   makes them checkable.
6. **When something is deliberately not done, mark it `dropped` and say why.** The
   most expensive form of backlog rot is a good idea being re-proposed every few
   months and re-rejected every few months.
