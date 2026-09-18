// Only extension-owned pages may read extension storage. The public viewer stays local-file-only.
if (
  location.protocol === "chrome-extension:" &&
  location.hash.startsWith("#capture=")
) {
  (async () => {
    try {
      const { latest } = await chrome.storage.local.get("latest");
      if (!latest) throw new Error("本地记录已清除，请重新模拟一次。");
      if (latest.id !== decodeURIComponent(location.hash.slice(9)))
        throw new Error("最新一场记录已更新，请从扩展重新打开回放。");
      const record = await CaptureCodec.decode(latest);
      install([
        AlphaSim.parse(
          record,
          "AlphaSim · " + new Date(latest.capturedAt).toLocaleString(),
        ),
      ]);
      history.replaceState(null, "", location.pathname);
    } catch (e) {
      document.getElementById("importStatus").textContent =
        "自动导入失败：" + e.message;
    }
  })();
}
