const { test } = require("node:test"),
  assert = require("node:assert/strict");
const { parse, parseRecords } = require("../src/alphasim.js"),
  A = require("../src/analysis.js"),
  fixture = require("../examples/demo.json");
const clone = () => structuredClone(fixture);
test("D(t) uses past samples and leaves short fights missing, even for early wins", () => {
  const b = parse(clone());
  assert.equal(A.damage(b, "my", "Demo_my_1", 5).value, 400);
  assert.equal(A.damage(b, "my", null, 10).value, null);
  b.times[20] = 2.1;
  assert.equal(A.damage(b, "my", "Demo_my_1", 2).value, 0);
});
test("post-death damage remains counted and missing units are not zero", () => {
  const b = parse(clone());
  b.sides.my[1].death = 3;
  assert.equal(A.damage(b, "my", "Demo_my_1", 5).value, 400);
  assert.equal(A.damage(b, "my", "absent", 5).value, null);
  assert.equal(A.metrics(b, "my", "Demo_my_1").survival10, 0);
  assert.equal(A.metrics(b, "my", "Demo_my_0").survival10, null);
});
test("quantiles exclude missing samples rather than treating them as zeros", () => {
  assert.deepEqual(A.stats([null, 100, 200, 300, 400]), {
    n: 4,
    median: 250,
    q1: 175,
    q3: 325,
  });
  assert.equal(A.stats([null]).median, null);
});
test("grouping isolates gear, positions, stars and opponents but ignores root seeds", () => {
  const base = clone(),
    seed = clone(),
    gear = clone(),
    pos = clone(),
    stars = clone(),
    enemy = clone(),
    unknown = clone();
  seed.request.seed = 42;
  gear.request.myLineup[1].items = ["other"];
  pos.request.myLineup[1].position.col = 0;
  stars.request.myLineup[1].stars = 3;
  enemy.request.enemyLineup[0].apiName = "Other";
  delete unknown.request;
  const g = A.groups(
    [base, seed, gear, pos, stars, enemy, unknown, unknown].map((x) =>
      parse(x),
    ),
  );
  assert.equal(g.length, 7);
  assert.equal(g[0].indices.length, 2);
  assert.equal(g[0].opponent, g[1].opponent);
  assert.notEqual(g[0].opponent, g[4].opponent);
});
test("session envelope preserves trials and rejects empty batches", () => {
  assert.equal(
    parseRecords({
      format: "tft-replay-session/v1",
      records: [clone(), clone()],
    }).length,
    2,
  );
  assert.throws(() =>
    parseRecords({ format: "tft-replay-session/v1", records: [] }),
  );
});
test("multi-battle demo shows two configurations and correct D20 coverage", () => {
  const battles = parseRecords(require("../examples/multi-battle.json")),
    groups = A.groups(battles);
  assert.equal(groups.length, 2);
  assert.deepEqual(
    groups.map((g) => g.indices.length),
    [4, 2],
  );
  const values = groups[0].indices.map(
    (i) => A.damage(battles[i], "my", null, 20).value,
  );
  assert.deepEqual(A.stats(values), { n: 2, median: 500, q1: 450, q3: 550 });
});
