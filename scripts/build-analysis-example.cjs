// Six authored fictional battles; varied timing illustrates sampling coverage, not game strength.
const fs = require("node:fs"),
  path = require("node:path"),
  base = require("../examples/demo.json");
const records = [1, 2, 3, 3.5, 2.2, 3].map((factor, index) => {
  const r = structuredClone(base),
    d = r.response.data,
    old = base.response.data;
  r.trial = index + 1;
  r.capturedAt = new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString();
  d.timeAxis = Array.from(
    { length: Math.round(8 * factor * 10) + 1 },
    (_, i) => i / 10,
  );
  if (index >= 4) {
    r.request.myLineup[1].items = ["demo_alternative"];
    r.request.myLineup[1].position.col = 4;
    d.myReplayChamps[1].equipment = [
      { itemApiName: "demo_alternative", name: "方案 B 演示装备" },
    ];
  }
  for (const side of ["my", "en"]) {
    for (const suffix of ["CastEvents", "DmgPopEvents"])
      d[side + suffix] = old[side + suffix].map((e) => ({
        ...e,
        t: Math.round(e.t * factor * 10) / 10,
      }));
    d[side + "DeathTimes"] = old[side + "DeathTimes"].map((t) =>
      t === null ? null : Math.round(t * factor * 10) / 10,
    );
    d[side + "CumDmg"] = old[side + "CumDmg"].map((_, ci) =>
      d.timeAxis.map((t) =>
        d[side + "DmgPopEvents"]
          .filter((e) => e.ci === ci && e.t <= t)
          .reduce((n, e) => n + e.dmg, 0),
      ),
    );
    d[side + "PosSnaps"] = old[side + "PosSnaps"].map((positions, ci) =>
      d.timeAxis.map(() => ({
        ...positions[0],
        ...(index >= 4 && side === "my" && ci === 1 ? { cx: 4 } : {}),
      })),
    );
    d[side + "CsSnaps"] = old[side + "CsSnaps"].map((snaps, ci) =>
      d.timeAxis.map((t) => {
        const max = snaps[0].maxHp,
          enemy = side === "my" ? "en" : "my";
        const dmg = d[enemy + "DmgPopEvents"] || [];
        return {
          ...snaps[0],
          hp: Math.max(
            0,
            max -
              dmg
                .filter((e) => e.tci === ci && e.t <= t)
                .reduce((n, e) => n + e.dmg, 0),
          ),
          dead:
            d[side + "DeathTimes"][ci] !== null &&
            t >= d[side + "DeathTimes"][ci],
        };
      }),
    );
  }
  // Both sides' event times must be updated before deriving damage received.
  for (const side of ["my", "en"])
    d[side + "CsSnaps"].forEach((snaps, ci) =>
      snaps.forEach((s, i) => {
        s.hp = Math.max(
          0,
          s.maxHp -
            d[(side === "my" ? "en" : "my") + "DmgPopEvents"]
              .filter((e) => e.tci === ci && e.t <= d.timeAxis[i])
              .reduce((n, e) => n + e.dmg, 0),
        );
      }),
    );
  return r;
});
fs.writeFileSync(
  path.join(__dirname, "../examples/multi-battle.json"),
  JSON.stringify({ format: "tft-replay-session/v1", records }, null, 2) + "\n",
);
