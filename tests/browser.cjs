const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");
const path = require("node:path");
const fs = require("node:fs");
(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.BROWSER_CHANNEL
      ? { channel: process.env.BROWSER_CHANNEL }
      : {}),
  });
  try {
    const page = await browser.newPage({
        viewport: { width: 1440, height: 1050 },
      }),
      errors = [],
      remote = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("request", (r) => {
      if (/^https?:/.test(r.url())) remote.push(r.url());
    });
    await page.goto(pathToFileURL(path.join(__dirname, "../index.html")).href);
    assert.match(await page.locator("#importStatus").innerText(), /自制示例/);
    await page.selectOption("#unitSelect", "my:1");
    await page.locator("#firstCast").click();
    assert.match(await page.locator("#clock").innerText(), /1.6/);
    await page.locator("#firstImpact").click();
    assert.match(await page.locator("#clock").innerText(), /2.0/);
    assert.match(await page.locator("#eventDetail").innerText(), /200/);
    const fixture = require("../examples/demo.json"),
      gzip = require("node:zlib").gzipSync(JSON.stringify(fixture));
    await page.locator("#files").setInputFiles([
      { name: "one.json.gz", mimeType: "application/gzip", buffer: gzip },
      {
        name: "two.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(fixture.response.data)),
      },
    ]);
    await page.waitForFunction(
      () => document.querySelector("#trial").options.length === 2,
    );
    await page.selectOption("#trial", "1");
    assert.equal(await page.locator("#downloadRequest").isDisabled(), true);
    await page
      .locator("#files")
      .setInputFiles({
        name: "bad.json",
        mimeType: "application/json",
        buffer: Buffer.from("{}"),
      });
    await page.waitForFunction(() =>
      document.querySelector("#importStatus").textContent.includes("导入失败"),
    );
    assert.equal(await page.locator("#trial option").count(), 2);
    // Malicious imported names and event strings must remain inert text.
    const bad = structuredClone(fixture);
    bad.response.data.myReplayChamps[1].displayName =
      '<img src=x onerror="window.pwned=1">';
    bad.response.data.myDmgPopEvents[0].popKind =
      '<svg onload="window.pwned=1">';
    await page
      .locator("#files")
      .setInputFiles({
        name: "text.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(bad)),
      });
    await page.waitForFunction(
      () => document.querySelector("#trial").options.length === 1,
    );
    await page.selectOption("#unitSelect", "my:1");
    assert.equal(await page.evaluate(() => window.pwned), undefined);
    await page.locator("#demo").click();
    await page.locator("#play").click();
    await page.waitForTimeout(350);
    await page.locator("#play").click();
    assert.ok(parseFloat(await page.locator("#clock").innerText()) > 0);
    fs.mkdirSync(path.join(__dirname, "../test-results"), { recursive: true });
    await page.screenshot({
      path: path.join(__dirname, "../test-results/desktop.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.screenshot({
      path: path.join(__dirname, "../test-results/mobile.png"),
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    assert.deepEqual(remote, []);
    console.log(
      "PASS: import JSON/gzip, multiple battles, events, malformed input, inert names, playback, mobile, zero network requests",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
