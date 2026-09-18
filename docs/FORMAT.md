# Supported saved-log format

This documents an observed response shape, not an official AlphaSim API contract. There is no network client or automatic simulator integration.

Accepted JSON roots:

```text
{ request?: {...}, response: { data: <battle> }, trial?: number }
{ data: <battle> }
<battle>
```

Each imported file represents one battle. Monte Carlo summary responses are not supported. gzip is detected by its magic bytes, not the filename.

## Required battle fields

| Field | Shape |
| --- | --- |
| `timeAxis` | 2–20000 finite strictly increasing numbers, starting at 0 |
| `winner` | `my`, `enemy` / `en`, or `draw` |
| `myChamps`, `enemyChamps` | Original units; must match the prefix of replay units |
| `myReplayChamps`, `enReplayChamps` | Runtime units, including summons, at most 64 per side |
| `myCsSnaps`, `enCsSnaps` | `[unit][time]` state objects, containing finite `hp`, `maxHp > 0`, `mana`, `shield` |
| `myPosSnaps`, `enPosSnaps` | `[unit][time]` objects `{cx, cy}` |
| `myCumDmg`, `enCumDmg` | `[unit][time]` nonnegative finite cumulative-damage values |
| `myDeathTimes`, `enDeathTimes` | `[unit]` nonnegative finite number, or null |
| `myTotalDmg`, `enTotalDmg` | `[unit]` nonnegative finite total damage |

Each runtime champion needs `apiName`, integer `stars` (1–4), and nonnegative `mm` (max mana). Optional fields include `displayName` / `name`, `equipment`, `ability`, `preCombatSacrifice` and loaded stats. Items display their `name` or `itemApiName`.

Optional event arrays: `myCastEvents`, `enCastEvents`, `myDmgPopEvents`, `enDmgPopEvents`. Their absence creates a visible warning. Every event needs finite `t` and valid source index `ci`; damage records need finite `dmg`, and positive/nonnegative damage needs a valid opposite-side `tci`. Negative damage is classified as an unverified healing/negative-value record, without assuming target ownership. Cast `targetCis` remain raw indices because same-side buffs are not independently classified.

Optional snapshot columns are preserved when present and displayed as unavailable when absent. Exact fields used by the viewer are listed in `src/alphasim.js` as `keys`.

## Coordinates and time

The schematic maps engine `cx` horizontally and `cy` vertically, with `cy=0` at the bottom. It does not recreate the game's exact hex geometry. Original lineup `position.row/col` are separately displayed from the request. Playback follows time-axis intervals; event navigation uses the nearest recorded sample, whose time is shown in the details.

New runtime units can have snapshots padded before birth. Only `death_summon_DA_Krug18_*` currently has an explicit supported inference, using the `DA_Krug18` parent's death. Unknown births stay off the board with a warning. This rule is not generalized to other summons.

The viewer preserves raw records for download. It does not recompute combat, normalize damage totals, infer missing crits, or silently accept incompatible array lengths.

## Example

See [`examples/demo.json`](../examples/demo.json), which is authored fictional data under MIT. It uses the wrapper format and contains no real champion statistics or exported service records.

Some observed responses contain scheduled events after the final sampled state. These events are retained with a warning; selecting them shows the final two samples as reference only. The viewer never extends the time axis with fabricated states. Tiny floating-point differences in death times use a 1e-6 tolerance for the display.
