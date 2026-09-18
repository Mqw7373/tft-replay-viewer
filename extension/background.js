// Serialise history mutations across tabs; store compressed logs in extension-owned IndexedDB.
const dbPromise = new Promise((resolve, reject) => {
  const r = indexedDB.open("tft-replay-history", 1);
  r.onupgradeneeded = () =>
    r.result.createObjectStore("records", { keyPath: "id" });
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
});
async function readAll() {
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const r = db.transaction("records").objectStore("records").getAll();
    r.onsuccess = () => resolve(r.result.sort((a, b) => a.savedAt - b.savedAt));
    r.onerror = () => reject(r.error);
  });
}
async function write(fn) {
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const tx = db.transaction("records", "readwrite");
    fn(tx.objectStore("records"));
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
async function badge() {
  const entries = await readAll(),
    { captureError } = await chrome.storage.local.get("captureError");
  await chrome.action.setBadgeText({
    text: captureError ? "!" : entries.length ? String(entries.length) : "",
  });
  await chrome.action.setBadgeBackgroundColor({
    color: captureError ? "#aa532f" : "#146779",
  });
  await chrome.storage.local.set({
    historyCount: entries.length,
    historyUpdated: Date.now(),
  });
}
async function migrate() {
  const { latest } = await chrome.storage.local.get("latest");
  if (latest) {
    await write((store) =>
      store.put({
        ...latest,
        savedAt: Date.parse(latest.capturedAt) || Date.now(),
        rawBytes: latest.rawBytes || 50 * 1024 * 1024,
      }),
    );
    await chrome.storage.local.remove("latest");
  }
}
let queue = migrate()
  .then(badge)
  .catch(() => {});
async function openAnalysis(active = false) {
  const url = chrome.runtime.getURL("viewer/index.html#history");
  const contexts = await chrome.runtime.getContexts({ contextTypes: ["TAB"] });
  let tabId = contexts.find((c) => c.documentUrl === url)?.tabId;
  if (tabId === undefined) {
    const { analysisTabId } = await chrome.storage.session.get("analysisTabId");
    if (analysisTabId !== undefined) {
      const tab = await chrome.tabs.get(analysisTabId).catch(() => null);
      if (tab?.status === "loading") tabId = tab.id;
    }
  }
  if (tabId !== undefined) {
    if (active) await chrome.tabs.update(tabId, { active: true });
  } else {
    const tab = await chrome.tabs.create({ url, active });
    await chrome.storage.session.set({ analysisTabId: tab.id });
  }
  return {};
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return false;
  const internal = sender.url?.startsWith(chrome.runtime.getURL("")),
    host = sender.url?.startsWith("https://tftalphasim.com/");
  if (
    !internal &&
    !(
      host &&
      sender.frameId === 0 &&
      ["save", "capture-error", "host-ready"].includes(message?.type)
    )
  )
    return false;
  queue = queue
    .then(async () => {
      if (message.type === "host-ready") return openAnalysis();
      if (message.type === "open-analysis" && internal)
        return openAnalysis(true);
      if (message.type === "capture-error") {
        await chrome.storage.local.set({
          captureError: String(message.error).slice(0, 300),
        });
        await badge();
        return {};
      }
      if (message.type === "save") {
        const e = message.entry;
        if (
          !e ||
          typeof e.id !== "string" ||
          e.encoding !== "gzip-base64" ||
          typeof e.data !== "string" ||
          e.data.length > 8 * 1024 * 1024 ||
          !Number.isFinite(e.rawBytes) ||
          e.rawBytes < 1 ||
          e.rawBytes > 50 * 1024 * 1024
        )
          throw new Error("采集记录格式无效。");
        const entries = await readAll();
        if (entries.some((x) => x.id === e.id)) return {};
        if (
          entries.length >= 100 ||
          entries.reduce((n, x) => n + x.data.length, 0) + e.data.length >
            32 * 1024 * 1024 ||
          entries.reduce((n, x) => n + (x.rawBytes || 50 * 1024 * 1024), 0) +
            e.rawBytes >
            512 * 1024 * 1024
        )
          throw new Error(
            "历史记录已达容量上限，已保留旧记录。请导出并清除后继续采集。",
          );
        await write((store) => store.put({ ...e, savedAt: Date.now() }));
        await chrome.storage.local.remove("captureError");
        await badge();
        return {};
      }
      if (message.type === "list")
        return (await readAll()).map(({ id, capturedAt, rawBytes }) => ({
          id,
          capturedAt,
          rawBytes,
        }));
      if (message.type === "get") {
        const entry = (await readAll()).find((e) => e.id === message.id);
        if (!entry) throw new Error("记录已被清除，请重新打开分析。");
        return entry;
      }
      if (message.type === "clear") {
        await write((store) => store.clear());
        await chrome.storage.local.remove(["latest", "captureError"]);
        await badge();
        return {};
      }
      throw new Error("不支持的操作。");
    })
    .then((data) => respond({ ok: true, data }))
    .catch(async (e) => {
      if (message.type === "save")
        await chrome.storage.local.set({ captureError: e.message });
      await badge();
      respond({ ok: false, error: e.message });
    });
  return true;
});
chrome.runtime.onStartup.addListener(() => {
  queue = queue.then(badge).catch(() => {});
});
