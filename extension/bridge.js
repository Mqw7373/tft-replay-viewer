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
          await chrome.storage.local.set({ latest, captureError: null });
        } catch (e) {
          await chrome.storage.local.set({
            captureError: String(e.message).slice(0, 300),
          });
        }
      })
      .catch(() => {}); // Extension reload / storage failure must not break the host page.
  });
})();
