const { chromium } = require("playwright");
const path = require("node:path"),
  assert = require("node:assert/strict");
require("../scripts/build-extension.cjs");
async function until(fn) {
  for (let i = 0; i < 100; i++) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Timed out waiting for extension state");
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
      (await context.waitForEvent("serviceworker"));
    const id = worker.url().split("/")[2],
      fixture = require("../examples/demo.json");
    let requests = 0;
    await context.route("https://tftalphasim.com/**", async (route) => {
      if (new URL(route.request().url()).pathname === "/api/simulate") {
        requests++;
        await route.fulfill({ json: fixture.response.data });
      } else
        await route.fulfill({
          contentType: "text/html",
          body: "<!doctype html><title>Capture fixture</title><p>Controlled fixture — no live simulation.</p>",
        });
    });
    const host = await context.newPage();
    await host.goto("https://tftalphasim.com/simulator.html");
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${id}/popup.html`);
    assert.equal(await popup.locator("#open").isDisabled(), true);
    const observed = await host.evaluate(async (request) => {
      const r = await fetch("/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      return (await r.json()).winner;
    }, fixture.request);
    assert.equal(observed, "my");
    await until(async () => !(await popup.locator("#open").isDisabled()));
    let saved = await worker.evaluate(() => chrome.storage.local.get("latest"));
    assert.ok(saved.latest.data);
    const next = context.waitForEvent("page");
    await popup.click("#open");
    const viewer = await next;
    await viewer.waitForLoadState();
    await until(async () =>
      (await viewer.locator("#result").textContent()).includes("AlphaSim"),
    );
    assert.match(await viewer.locator("#request").textContent(), /myLineup/);
    await viewer.selectOption("#unitSelect", "my:1");
    await viewer.click("#firstImpact");
    assert.match(await viewer.locator("#clock").innerText(), /2.0/);
    const download = popup.waitForEvent("download");
    await popup.click("#download");
    const file = await download;
    const downloaded = JSON.parse(
      require("node:fs").readFileSync(await file.path(), "utf8"),
    );
    assert.deepEqual(downloaded.request, fixture.request);
    assert.equal(downloaded.response.data.winner, "my");
    // Error responses must retain the last successful capture and show the error.
    const previous = saved.latest.id;
    await context.route("https://tftalphasim.com/api/simulate", (route) =>
      route.fulfill({ status: 500, json: { error: "fixture" } }),
    );
    await host.evaluate(() =>
      fetch("/api/simulate", { method: "POST", body: "{}" }),
    );
    await until(async () =>
      (await popup.locator("#error").textContent()).includes("500"),
    );
    saved = await worker.evaluate(() => chrome.storage.local.get("latest"));
    assert.equal(saved.latest.id, previous);
    await context.unroute("https://tftalphasim.com/api/simulate");
    // XHR and Request objects both preserve the site's original response.
    await host.evaluate(
      (request) =>
        new Promise((resolve, reject) => {
          const x = new XMLHttpRequest();
          x.open("POST", "/api/simulate");
          x.responseType = "json";
          x.onload = () => resolve(x.response.winner);
          x.onerror = reject;
          x.send(JSON.stringify(request));
        }),
      fixture.request,
    );
    await until(
      async () => (await popup.locator("#error").textContent()) === "",
    );
    const beforeRequest = (await worker.evaluate(() => chrome.storage.local.get("latest"))).latest.id;
    await host.evaluate(async (request) => {
      const req = new Request(location.origin + "/api/simulate", {
        method: "POST",
        body: JSON.stringify(request),
      });
      return (await (await fetch(req)).json()).winner;
    }, fixture.request);
    await until(async () => (await worker.evaluate(() => chrome.storage.local.get("latest"))).latest.id !== beforeRequest);
    assert.equal(requests, 3); // Exactly the three caller-issued successful requests, no extra simulation.
    await popup.click("#clear");
    assert.equal(await popup.locator("#open").isDisabled(), true);
    const result = await worker.evaluate(() =>
      chrome.storage.local.get("latest"),
    );
    assert.equal(result.latest, undefined);
    console.log(
      "PASS: installed extension captures fetch/Request/XHR, preserves responses, saves request+result, opens local replay, downloads and clears; no extra simulations.",
    );
  } finally {
    await context.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
