(() => {
  let queue = Promise.resolve();
  window.addEventListener("message", (event) => {
    if (
      event.source !== window ||
      event.origin !== "https://tftalphasim.com" ||
      event.data?.tag !== "tft-replay-capture-v1"
    )
      return;
    const message = event.data;
    queue = queue
      .then(async () => {
        try {
          if (message.error)
            throw new Error(String(message.error).slice(0, 300));
          const record = message.record;
          AlphaSim.parse(record);
          const latest = await CaptureCodec.encode(record);
          const result = await chrome.runtime.sendMessage({
            type: "save",
            entry: latest,
          });
          if (!result?.ok) throw new Error(result?.error || "无法保存记录。");
        } catch (e) {
          await chrome.runtime.sendMessage({
            type: "capture-error",
            error: String(e.message).slice(0, 300),
          });
        }
      })
      .catch(() => {}); // Extension reload / storage failure must not break the host page.
  });
})();
