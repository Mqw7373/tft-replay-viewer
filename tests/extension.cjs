const { chromium } = require("playwright"),
  path = require("node:path"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  zlib = require("node:zlib");
require("../scripts/build-extension.cjs");
async function until(fn) {
  for (let i = 0; i < 150; i++) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Extension state timeout");
}
const dir = path.resolve(__dirname, "../dist/extension");
(async () => {
  const context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: true,
    args: [`--disable-extensions-except=${dir}`, `--load-extension=${dir}`],
  });
  try {
    const worker =
        context.serviceWorkers()[0] ||
        (await context.waitForEvent("serviceworker")),
      id = worker.url().split("/")[2],
      fixture = require("../examples/demo.json");
    let requests = 0;
    await context.route("https://tftalphasim.com/**", async (route) => {
      if (new URL(route.request().url()).pathname === "/api/simulate") {
        requests++;
        await route.fulfill({ json: fixture.response.data });
      } else
        await route.fulfill({
          contentType: "text/html",
          body: "<!doctype html><p>Controlled fixture</p>",
        });
    });
    const host = await context.newPage();
    await host.goto("https://tftalphasim.com/simulator.html");
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${id}/popup.html`);
    popup.on("dialog", (d) => d.accept());
    const count = () => worker.evaluate(async () => (await readAll()).length);
    assert.equal(await popup.locator("#open").isDisabled(), true);
    assert.equal(
      await host.evaluate(
        async (request) =>
          (
            await (
              await fetch("/api/simulate", {
                method: "POST",
                body: JSON.stringify(request),
              })
            ).json()
          ).winner,
        fixture.request,
      ),
      "my",
    );
    await until(async () => (await count()) === 1);
    await host.evaluate(
      (request) =>
        new Promise((resolve) => {
          const x = new XMLHttpRequest();
          x.open("POST", "/api/simulate");
          x.responseType = "json";
          x.onload = () => resolve(x.response.winner);
          x.send(JSON.stringify(request));
        }),
      fixture.request,
    );
    await host.evaluate(
      async (request) =>
        (
          await (
            await fetch(
              new Request(location.origin + "/api/simulate", {
                method: "POST",
                body: JSON.stringify(request),
              }),
            )
          ).json()
        ).winner,
      fixture.request,
    );
    await until(async () => (await count()) === 3);
    await until(async () =>
      (await popup.locator("#status").textContent()).includes("3 场"),
    );
    assert.equal(requests, 3);
    const next = context.waitForEvent("page");
    await popup.click("#open");
    const viewer = await next;
    await viewer.waitForLoadState();
    await until(async () =>
      (await viewer.locator("#analysisCount").textContent()).includes("3 场"),
    );
    assert.equal(await viewer.locator("#groupSummary tr").count(), 1);
    assert.match(await viewer.locator("#request").textContent(), /myLineup/);
    await viewer.click('[data-replay="1"]');
    assert.equal(await viewer.locator("#trial").inputValue(), "1");
    const dl = popup.waitForEvent("download");
    await popup.click("#download");
    const file = await dl;
    const exported = JSON.parse(
      zlib.gunzipSync(fs.readFileSync(await file.path())),
    );
    assert.equal(exported.records.length, 3);
    assert.deepEqual(exported.records[0].request, fixture.request);
    await context.route("https://tftalphasim.com/api/simulate", (route) =>
      route.fulfill({ status: 500, json: { error: "fixture" } }),
    );
    await host.evaluate(() =>
      fetch("/api/simulate", { method: "POST", body: "{}" }),
    );
    await until(async () =>
      (await popup.locator("#error").textContent()).includes("500"),
    );
    assert.equal(await count(), 3);
    await popup.reload();
    await until(async () =>
      (await popup.locator("#status").textContent()).includes("3 场"),
    );
    // Migration of a 0.1 local-storage capture keeps the old record, exactly once.
    const old = await popup.evaluate(async (r) => {
      const entry = await CaptureCodec.encode({
        ...r,
        capturedAt: new Date().toISOString(),
      });
      await chrome.storage.local.set({ latest: entry });
      return entry.id;
    }, fixture);
    await worker.evaluate(async () => {
      await migrate();
      await migrate();
    });
    assert.equal(await count(), 4);
    assert.equal(
      (await worker.evaluate(() => chrome.storage.local.get("latest"))).latest,
      undefined,
    );
    // Capacity is explicit: reaching 100 entries does not delete existing records.
    const overflow = await popup.evaluate(async () => {
      const list = await rpc({ type: "list" }),
        sample = await rpc({ type: "get", id: list[0].id });
      for (let i = list.length; i < 100; i++)
        await rpc({
          type: "save",
          entry: { ...sample, id: crypto.randomUUID() },
        });
      try {
        await rpc({
          type: "save",
          entry: { ...sample, id: crypto.randomUUID() },
        });
        return "";
      } catch (e) {
        return e.message;
      }
    });
    assert.match(overflow, /容量上限/);
    assert.equal(await count(), 100);
    assert.ok(
      (await worker.evaluate(() => readAll())).some((e) => e.id === old),
    );
    await popup.click("#clear");
    await until(async () => (await count()) === 0);
    await until(() => popup.locator("#open").isDisabled());
    console.log(
      "PASS: history capture, grouping, gzip session export, error preservation, migration, capacity without eviction, clearing; exactly three requested simulations.",
    );
  } finally {
    await context.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
