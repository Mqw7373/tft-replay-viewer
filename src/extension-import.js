if (
  location.protocol === "chrome-extension:" &&
  (location.hash === "#history" || location.hash.startsWith("#capture="))
) {
  (async () => {
    try {
      const rpc = async (message) => {
        const r = await chrome.runtime.sendMessage(message);
        if (!r?.ok) throw new Error(r?.error || "扩展未响应");
        return r.data;
      };
      const entries = await rpc({ type: "list" });
      if (!entries.length)
        throw new Error("本地记录为空，请先在 AlphaSim 模拟。");
      const battles = [];
      for (const [i, e] of entries.entries()) {
        $("importStatus").textContent =
          `正在载入本地历史 ${i + 1}/${entries.length}…`;
        battles.push(
          AlphaSim.parse(
            await CaptureCodec.decode(await rpc({ type: "get", id: e.id })),
            "AlphaSim · " + new Date(e.capturedAt).toLocaleString(),
          ),
        );
      }
      install(battles);
      history.replaceState(null, "", location.pathname);
    } catch (e) {
      $("importStatus").textContent = "自动导入失败：" + e.message;
    }
  })();
}
