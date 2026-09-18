const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { parse, readFile } = require("../src/alphasim.js");
const fixture = require("../examples/demo.json");
const clone = () => structuredClone(fixture);
test("all published examples match the offline bundle and expose their documented milestones", () => {
  const context = { window: {} };
  vm.runInNewContext(
    fs.readFileSync(require.resolve("../examples/demo.js"), "utf8"),
    context,
  );
  const manifest = require("../examples/index.json");
  assert.equal(manifest.length, 5);
  manifest.forEach((entry, i) => {
    const record = require("../examples/" + entry.file);
    assert.equal(
      record.synthetic === true ||
        record.records?.every((r) => r.synthetic === true),
      true,
    );
    assert.equal(
      JSON.stringify(context.window.DEMO_EXAMPLES[i].record),
      JSON.stringify(record),
    );
    require("../src/alphasim.js").parseRecords(record);
  });
  const dot = parse(require("../examples/delayed-dot.json"));
  assert.equal(dot.sides.my[1].cum[30], 0);
  assert.equal(dot.sides.my[1].cum[31], 240);
  assert.equal(dot.sides.my[1].total, 600);
  const shield = require("../examples/shield-heal.json").response.data
    .myCsSnaps[0];
  assert.equal(shield[20].shield, 100);
  assert.equal(shield[30].hp, 850);
  assert.equal(shield[40].hp, 950);
  assert.equal(shield[50].hp, 600);
  const summon = parse(require("../examples/death-summon.json"));
  assert.equal(summon.sides.en[2].birth, 3);
  assert.equal(summon.sides.en[2].death, 6);
});
test("wrapper and raw response preserve damage, events and missing request", () => {
  const b = parse(clone());
  assert.equal(b.sides.my[1].cum.at(-1), 1600);
  assert.equal(b.sides.en[0].death, 6);
  assert.equal(b.events.filter((e) => e.kind === "damage").length, 9);
  assert.equal(parse(fixture.response.data).request, null);
  const context = { window: {} };
  vm.runInNewContext(
    fs.readFileSync(require.resolve("../examples/demo.js"), "utf8"),
    context,
  );
  assert.equal(
    JSON.stringify(context.window.DEMO_LOG),
    JSON.stringify(fixture),
  );
});
test("rejects incompatible snapshots, indices and time axes", () => {
  let x = clone();
  x.response.data.myCsSnaps[0].pop();
  assert.throws(() => parse(x), /长度/);
  x = clone();
  x.response.data.myDmgPopEvents[0].tci = 99;
  assert.throws(() => parse(x), /目标/);
  x = clone();
  x.response.data.timeAxis[1] = 0;
  assert.throws(() => parse(x), /timeAxis/);
  x = clone();
  x.response.data.myCsSnaps[0][0].hp = null;
  assert.throws(() => parse(x), /快照/);
});
test("unknown births are hidden, known death summons use parent death", () => {
  const x = clone(),
    d = x.response.data;
  d.enReplayChamps.push({ ...d.enReplayChamps[0], apiName: "UnknownSummon" });
  for (const suffix of [
    "CsSnaps",
    "PosSnaps",
    "CumDmg",
    "DeathTimes",
    "TotalDmg",
  ])
    d["en" + suffix].push(structuredClone(d["en" + suffix][0]));
  assert.equal(parse(x).sides.en[2].birth, null);
  assert.match(parse(x).warnings.join(), /出生时刻未知/);
  d.enReplayChamps[0].apiName = "DA_Krug18";
  d.enemyChamps[0].apiName = "DA_Krug18";
  d.enReplayChamps[2].id = "death_summon_DA_Krug18_0";
  assert.equal(parse(x).sides.en[2].birth, 6);
});
test("gzip import and negative events retain their meaning", async () => {
  const x = clone();
  x.response.data.myDmgPopEvents.push({ t: 1, ci: 0, tci: 999, dmg: -30 });
  assert.equal(parse(x).events.find((e) => e.kind === "heal").raw.dmg, -30);
  const gzip = require("node:zlib").gzipSync(JSON.stringify(x));
  const file = new File([gzip], "sample.json.gz");
  assert.equal((await readFile(file)).label, "sample.json.gz");
  await assert.rejects(readFile(new File(["not json"], "bad.json")));
});
test("events after the last sampled state remain visible without inventing snapshots", () => {
  const x = clone();
  x.response.data.enDeathTimes[1] = 8.000000000000002;
  x.response.data.myDmgPopEvents.push({ t: 8.1, ci: 1, tci: 1, dmg: 20 });
  const b = parse(x);
  assert.equal(b.times.at(-1), 8);
  assert.equal(b.events.at(-1).t, 8.1);
  assert.match(b.warnings.join(), /晚于/);
});
