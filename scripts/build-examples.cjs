// Authored fictional scenarios. No game statistics or service responses are used.
const fs = require("node:fs");
const path = require("node:path");
const original = require("../examples/demo.json");
const clone = () => structuredClone(original);
const hit = (t, ci, tci, dmg, stage) => ({
  t,
  ci,
  tci,
  dmg,
  phys: false,
  ...(stage ? { stage } : {}),
});
function reset(record) {
  const d = record.response.data;
  d.winner = "draw";
  for (const side of ["my", "en"]) {
    d[side + "CastEvents"] = [];
    d[side + "DmgPopEvents"] = [];
    d[side + "DeathTimes"].fill(null);
    d[side + "CsSnaps"].forEach((snaps) =>
      snaps.forEach((s) => {
        s.hp = s.maxHp = 1000;
        s.shield = 0;
        s.dead = false;
      }),
    );
  }
  return d;
}
function save(file, record) {
  const d = record.response.data;
  for (const side of ["my", "en"]) {
    d[side + "CumDmg"] = d[side + "ReplayChamps"].map((_, i) =>
      d.timeAxis.map((t) =>
        d[side + "DmgPopEvents"]
          .filter((e) => e.ci === i && e.dmg > 0 && e.t <= t)
          .reduce((n, e) => n + e.dmg, 0),
      ),
    );
    d[side + "TotalDmg"] = d[side + "CumDmg"].map((a) => a.at(-1));
  }
  require("../src/alphasim.js").parse(record);
  fs.writeFileSync(
    path.join(__dirname, "../examples", file),
    JSON.stringify(record, null, 2) + "\n",
  );
}
const dot = clone(),
  a = reset(dot);
a.myCastEvents = [
  { t: 2.5, ci: 1, abType: "twostage", targetCis: [0] },
  { t: 3.1, ci: 1, abType: "dot", targetCis: [0], chanDur: 3 },
];
a.myDmgPopEvents = [
  hit(3.1, 1, 0, 240, 1),
  ...[4.1, 5.1, 6.1].map((t) => hit(t, 1, 0, 120, 2)),
];
a.enCsSnaps[0].forEach((s, i) => {
  s.hp =
    1000 -
    a.myDmgPopEvents
      .filter((e) => e.t <= a.timeAxis[i])
      .reduce((n, e) => n + e.dmg, 0);
});
save("delayed-dot.json", dot);

const shield = clone(),
  b = reset(shield);
b.enDmgPopEvents = [hit(2, 1, 0, 200), hit(3, 1, 0, 250), hit(5, 1, 0, 350)];
b.myDmgPopEvents = [hit(4, 0, 0, -100)];
b.myCastEvents = [
  { t: 1, ci: 0, abType: "shield" },
  { t: 4, ci: 0, abType: "heal" },
];
b.myCsSnaps[0].forEach((s, i) => {
  const t = b.timeAxis[i];
  s.shield = t < 1 ? 0 : t < 2 ? 300 : t < 3 ? 100 : 0;
  s.hp = t < 3 ? 1000 : t < 4 ? 850 : t < 5 ? 950 : 600;
});
save("shield-heal.json", shield);

const summon = clone(),
  c = reset(summon);
for (const champ of [c.enemyChamps[0], c.enReplayChamps[0]]) {
  champ.apiName = "DA_Krug18";
  champ.displayName = "演示召唤母体";
}
summon.request.enemyLineup[0].apiName = "DA_Krug18";
c.enReplayChamps.push({
  apiName: "Demo_Summon",
  id: "death_summon_DA_Krug18_0",
  displayName: "演示召唤物",
  stars: 1,
  mm: 0,
  equipment: [],
});
c.enDeathTimes = [3, null, 6];
c.enPosSnaps.push(c.timeAxis.map(() => ({ cx: 3, cy: 4 })));
c.enCsSnaps.push(
  c.timeAxis.map((t) => ({
    ...c.enCsSnaps[0][0],
    hp: t < 4 ? 400 : t < 6 ? 250 : 0,
    maxHp: 400,
    mana: 0,
    dead: t >= 6,
  })),
);
c.myDmgPopEvents = [
  hit(2, 1, 0, 300),
  hit(3, 1, 0, 300),
  hit(4, 1, 2, 150),
  hit(6, 1, 2, 250),
];
c.myCastEvents = c.myDmgPopEvents.map((e) => ({
  t: e.t - 0.4,
  ci: 1,
  abType: "instant",
  targetCis: [e.tci],
}));
c.enCsSnaps[0].forEach((s, i) => {
  const t = c.timeAxis[i];
  s.maxHp = 600;
  s.hp = t < 2 ? 600 : t < 3 ? 300 : 0;
  s.dead = t >= 3;
});
save("death-summon.json", summon);
require("./sync-demo.cjs");
