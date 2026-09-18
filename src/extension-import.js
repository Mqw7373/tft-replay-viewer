if (
  location.protocol === "chrome-extension:" &&
  (location.hash === "#history" || location.hash.startsWith("#capture="))
) {
  history.replaceState(null, "", "#history");
  const status = document.createElement("section");
  status.className = "panel below";
  status.id = "liveStatus";
  status.setAttribute("role", "status");
  $("dropzone").before(status);
  const panels = [];
  for (
    let el = $("dropzone").nextElementSibling;
    el;
    el = el.nextElementSibling
  )
    panels.push(el);
  $("dropzone").style.display = "none";
  const showData = (visible) => {
    panels.forEach((el) => {
      el.style.display = visible ? "" : "none";
    });
  };
  showData(false);
  status.textContent = "正在连接 AlphaSim 本地记录…";
  const rpc = async (message) => {
    const r = await chrome.runtime.sendMessage(message);
    if (!r?.ok) throw new Error(r?.error || "扩展未响应");
    return r.data;
  };
  let cache = new Map(),
    signature = null,
    running = false,
    pending = false;
  async function sync() {
    pending = true;
    if (running) return;
    running = true;
    try {
      while (pending) {
        pending = false;
        const entries = await rpc({ type: "list" });
        const nextSignature = JSON.stringify(entries.map((e) => e.id));
        if (signature !== nextSignature) {
          const nextCache = new Map();
          for (const [i, e] of entries.entries()) {
            status.textContent = `正在同步 ${i + 1}/${entries.length} 场…`;
            nextCache.set(
              e.id,
              cache.get(e.id) ||
                AlphaSim.parse(
                  await CaptureCodec.decode(
                    await rpc({ type: "get", id: e.id }),
                  ),
                  "AlphaSim · " + new Date(e.capturedAt).toLocaleString(),
                ),
            );
          }
          cache = nextCache;
          signature = nextSignature;
          playing = false;
          $("play").textContent = "▶ 播放";
          showData(entries.length > 0);
          if (entries.length) {
            const previousTrial = +$("trial").value || 0;
            const previousGroup = $("analysisGroup").value;
            install([...cache.values()]);
            load(Math.min(previousTrial, entries.length - 1));
            $("trial").value = String(
              Math.min(previousTrial, entries.length - 1),
            );
            if (
              [...$("analysisGroup").options].some(
                (o) => o.value === previousGroup,
              )
            ) {
              $("analysisGroup").value = previousGroup;
              renderAnalysis();
            }
          } else {
            DATA.battles = [];
            battle = null;
          }
        }
        const { captureError } = await chrome.storage.local.get("captureError");
        status.textContent =
          (entries.length
            ? `自动接收中 · 已同步 ${entries.length} 场。继续在 AlphaSim 模拟，统计会自动更新。`
            : "等待模拟 · 请在 AlphaSim 摆好双方阵容并运行单场，结果会自动出现在这里。") +
          (captureError ? " 采集提示：" + captureError : "");
      }
    } catch (e) {
      status.textContent = "自动同步失败：" + e.message + "。可刷新本页重试。";
    } finally {
      running = false;
      if (pending) sync();
    }
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && (changes.historyUpdated || changes.captureError))
      sync();
  });
  sync();
}
