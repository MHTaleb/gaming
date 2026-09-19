# Research

What was read, when, what it said, and what it changed here.

Each finding carries its source and the date it was read, because reading decays.
The stale `targetSdk` claim in `PUBLISHING.md` is the cautionary tale: a true
statement that quietly became false, with nothing recording when it had last been
checked. Every finding below is also a `research` entry in
[`backlog.json`](../backlog/backlog.json), and the backlog items it produced are
listed with it so the chain from reading to work is traceable in both directions.

Read on **2026-09-19**.

---

## 1. Google Play requirements

### R-01 · Target API level — and a deadline that has passed

> Since 31 August 2026, new apps and app updates must target Android 16 (API
> level 36) or higher to be submitted to Google Play. Existing apps must target
> Android 15 (API level 35) or higher to remain available to new users on devices
> running a newer Android version.

Source: <https://developer.android.com/google/play/requirements/target-sdk>
(page last updated 2026-09-16)

**This is the most consequential finding in the document.** The app targets API 35
through Capacitor 7. An upload today is rejected. An extension to 1 November 2026
can be requested in Play Console, which is worth knowing but is not a plan.

**Produced:** PD-101 (upgrade to Capacitor 8), PD-102 (fix the stale claim).

### R-02 · The Data safety form is mandatory and covers the SDKs

Every app published on Play must complete the form, **including closed and open
test tracks**; only apps exclusively on the internal testing track are exempt. A
privacy policy link is required even for an app that collects nothing. The form
must also declare data collected by third-party libraries and SDKs, and Google's
review is explicitly *not* a verification of accuracy - the developer is solely
responsible, and enforcement follows a discrepancy.

Source: <https://support.google.com/googleplay/android-developer/answer/10787469>

**Why it matters here:** `docs/PRIVACY.md` and the in-game Settings screen both
state that no network calls happen during play. Co-op connects to a relay and
shows another player's chosen display name, so both statements are now false. The
form must also account for AdMob and the purchase plugin.

**Produced:** PD-106 (fix the policy and the Settings text), PD-107 (complete the
form).

### R-03 · Preview assets

The listing supports an app icon, short description, feature graphic, screenshots
and a preview video, with explicit **Requirements** (mandatory; failing them
risks removal or suspension) and notably weaker *Highly recommended* guidelines.
Assets appear across all test tracks once added. Adding assets grants Google a
licence to use them for promotion.

Source: <https://support.google.com/googleplay/android-developer/answer/9866151>

**Why it matters here:** the repository contained a designed 512x512 SVG icon and
**no raster assets at all**. A Play listing cannot be completed from that. There
was also no feature graphic and no screenshots, and the feature graphic is the
image used in search results and category pages - the highest-leverage piece of
art in the project.

**Produced:** PD-103 (PNG icon), PD-104 (feature graphic), PD-105 (screenshots),
PD-405 and PD-305 (the generator, and regenerating in CI).

### R-04 · Capacitor 8 migration

Capacitor 8 requires Node 22+, Android Studio Otter (2025.2.1)+, AGP 8.13.0,
Gradle 8.14.3, google-services 4.4.4 and Kotlin 2.2.20. Android variables become
`minSdkVersion 24`, `compileSdkVersion 36`, `targetSdkVersion 36`.
`android.adjustMarginsForEdgeToEdge` is removed in favour of the System Bars
plugin and CSS `env()` variables, and `density` is added to `configChanges`.

Source: <https://capacitorjs.com/docs/updating/8-0> and
<https://capacitorjs.com/docs/android>

**Why it matters here:** the local toolchain was on Node 20, which cannot run
Capacitor 8 at all. **Node 22.23.2 is now installed and set as the nvm default**,
and both harnesses were confirmed green under it.

The edge-to-edge change is the part most likely to bite: the game already uses
`env(safe-area-inset-*)` in its stylesheet and `HUD_H` is derived from content, so
the change should land well - but it has never been tested on a device.

**Produced:** PD-101, PD-108 (document and pin Node 22).

### R-05 · Tower defense genre design

The genre's three defining elements: a base to defend, waves of enemies, and
player-placed structures on or along the enemies' path. Commonly cited features
across successful titles include player-placed obstructions that damage attackers,
repair, upgrading, repairing the upgrade, a currency earned by defeating
attackers, enemies that traverse multiple paths, a set number and type of enemy
per wave, unlockable maps and levels, and movable towers.

Two specific findings stand out:

* **Mazing** - building a maze out of your own towers to lengthen the path - is
  named as the essential strategy of *Desktop Tower Defense* and *Flash Element
  Tower Defense*. **Our roads are fixed and generated, so we do not have it.**
* **Air units that ignore the board layout** are described as a recurring theme.
  **We have no equivalent:** every tower is placed relative to a single road.

*Kingdom Rush*, named in the same article, sold more than seventeen million copies
across the App Store and Play Store.

Source: <https://en.wikipedia.org/wiki/Tower_defense> (last edited 2026-09-05)

**Produced:** PD-201 (mazing), PD-202 (threats that ignore the road), PD-203
(targeting modes), PD-204 (repair), PD-205 (endless mode).

### R-06 · "Tower Defense" is a registered trademark

COM2uS was awarded a USPTO trademark for the term (serial 3442002, filed 2007,
granted 2008) and began enforcing it in 2010, requiring name changes on the App
Store. Apple's submission tool warns on the capitalised phrase; the lowercase
phrase is described as an acceptable descriptive use of a game style.

Source: <https://en.wikipedia.org/wiki/Tower_defense#USPTO_trademark>

**Why it matters here:** the store listing copy has not been written yet, so this
is free to get right now and expensive to fix after a review. The title, subtitle
and description must not use the capitalised phrase.

**Produced:** PD-109.

### R-07 · Content rating, ads and target audience

Play lists content rating, target audience and app content settings as separate
mandatory store-listing topics alongside the Data safety form, and the content
rating questionnaire covers the ads served in the app as well as the app itself.

Source: topic list on
<https://support.google.com/googleplay/android-developer/answer/9866151>

**Caveat, stated deliberately:** this is a topic list, not the requirement itself.
The content rating article needs to be read in full before the questionnaire is
completed. It is recorded here so the item is not forgotten, not as a citation.

**Produced:** PD-110, PD-111.

### R-08 · New personal developer accounts must test before production

**Not verified.** New personal (not organisation) Play Console accounts have
historically been required to run a closed test with a minimum number of testers
for a continuous period before production access is granted. The numbers have
changed over time and were not checked in this pass.

**Why it is recorded anyway:** if it applies, it sets a floor of weeks on the
launch date and means recruiting testers starts now rather than at submission.

**Produced:** PD-112 (a spike to read the current requirement in Play Console).

---

## 2. Tooling

### What was already here

Nothing but Node. No ffmpeg, no ImageMagick, no Inkscape, no GIMP, no Pillow.
Local Node was 20.

### What was installed, and why

| Tool | Where | Why |
|---|---|---|
| **Node 22.23.2** | nvm, set as default | Capacitor 8 requires it. Without this the Android build cannot run at all. |
| **`@resvg/resvg-js`** | devDependency | Rasterises the icon SVG into the PNGs Play requires. |

`@resvg/resvg-js` is deliberately **the only dependency in this repository**, and
it is a devDependency: the games, the static servers, the relay and the validator
still have none.

Rasterising SVG correctly is a real problem - path fills, dash arrays, patterns,
gradients - and hand-rolling it would be a weekend spent to arrive somewhere worse.
The alternative was exporting PNGs by hand from a graphics editor, which goes stale
the moment the icon changes and leaves nobody able to say which tool made them or
at what size. With the generator, `www/icon.svg` stays the single source of truth
and `node tools/store-assets.js --check` fails CI if the PNGs drift from it.

### What was deliberately NOT installed

**GIMP, Inkscape, Krita, Blender, LMMS, Audacity, Aseprite.** Every one of these is
a good tool and none of them belongs in this pipeline:

* They are GUI applications. There is no display here, and a build step that needs
  a human clicking is not a build step.
* The game's identity is that it has no assets. Adding a sprite pipeline would
  change that, and the change should be a decision (**PD-201**, the mazing spike,
  is where that decision would be forced) rather than a side effect of installing
  an art tool.
* The specific gap that needed filling was **one format conversion**, and a raster
  library fills it without an editor around it.

For audio, the same reasoning applies more strongly: `tracks.js` and `audio.js`
synthesise everything with the Web Audio API, so audio assets are not a gap to
fill with a tool - they are a design choice to keep. If better music is wanted,
the cheap direction is more synthesis in `music.js` (**PD-404**), not a DAW.

### If a real art pipeline is ever wanted

Recorded here so the decision is cheap when it is made: Aseprite (pixel art, paid,
excellent), Krita (free, painting), Inkscape (free, vector - already the format
the icon is in), Kenney's asset packs (free CC0, a legitimate shortcut for
programmers who cannot draw), LMMS (free, music), and `Bfxr`-style generators for
sound effects. All of them produce files that would have to be committed, which is
the part that changes the project's character.

---

## 3. What the research did not answer

Open questions, recorded rather than quietly dropped.

* **The pre-production testing requirement** (R-08) is unverified and could set the
  launch date.
* **The exact preview asset dimensions.** The Play help page describes the asset
  categories and their requirements but the detail lives behind expandable
  sections that did not render in the fetch. The sizes used here - a 512x512 icon
  and a 1024x500 feature graphic - are well established, and the generator asserts
  them, but they should be confirmed in Play Console before upload.
* **Whether the target audience answer will pull the game into the Families
  policy.** It has an IT theme and a difficulty ladder rather than anything
  child-directed, but the answer determines ad behaviour and is worth deciding
  deliberately rather than by default (**PD-111**).
* **Top-grossing tower defense teardowns.** Wikipedia gave the genre's design
  vocabulary and its history; it did not give a feature-by-feature comparison of
  what the current top titles monetise and retain with. That would be worth a
  dedicated pass before the retention work (**PD-205**, **PD-206**).
