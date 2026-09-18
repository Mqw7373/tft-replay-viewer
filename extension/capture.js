// Observe only the single-battle response. Never initiate a network request.
(() => {
  "use strict";
  if (window.__tftReplayCaptureInstalled) return;
  window.__tftReplayCaptureInstalled = true;
  const tag = "tft-replay-capture-v1";
  const limit = 50 * 1024 * 1024;
  const relevant = (url, method) => {
    try {
      const u = new URL(url, location.href);
      return (
        u.origin === "https://tftalphasim.com" &&
        u.pathname === "/api/simulate" &&
        String(method).toUpperCase() === "POST"
      );
    } catch {
      return false;
    }
  };
  function error(message) {
    window.postMessage(
      { tag, error: String(message).slice(0, 300) },
      location.origin,
    );
  }
  function deliver(text, body, status) {
    if (
      text.length > limit ||
      (typeof body === "string" && body.length > limit)
    )
      throw new Error("记录超过 50 MB，未自动保存。");
    const raw = JSON.parse(text),
      data = raw?.timeAxis ? raw : raw?.data;
    if (!data?.timeAxis)
      throw new Error("接口没有返回完整单场时间轴，未替换上一场记录。");
    let request = null;
    if (typeof body === "string" && body) {
      try {
        request = JSON.parse(body);
      } catch {}
    }
    window.postMessage(
      {
        tag,
        record: {
          request,
          response: { status, data },
          capturedAt: new Date().toISOString(),
        },
      },
      location.origin,
    );
  }
  const nativeFetch = window.fetch;
  window.fetch = function (input, init) {
    const watched = relevant(
      input instanceof Request ? input.url : input,
      init?.method || (input instanceof Request ? input.method : "GET"),
    );
    let body = Promise.resolve(null);
    if (watched) {
      try {
        body =
          init && Object.prototype.hasOwnProperty.call(init, "body")
            ? Promise.resolve(typeof init.body === "string" ? init.body : null)
            : input instanceof Request
              ? input.clone().text()
              : body;
      } catch {
        /* Keep the website request untouched if capture cannot inspect its body. */
      }
    }
    body = body.catch(() => null);
    const pending = nativeFetch.apply(this, arguments);
    if (watched)
      pending
        .then(async (response) => {
          if (!response.ok) {
            error(
              "本次模拟返回 HTTP " + response.status + "，上一场记录保留。",
            );
            return;
          }
          const copy = response.clone();
          deliver(await copy.text(), await body, response.status);
        })
        .catch((e) => error(e.message));
    return pending;
  };
  const state = new WeakMap(),
    open = XMLHttpRequest.prototype.open,
    send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    state.set(this, { watched: relevant(url, method) });
    return open.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (body) {
    if (state.get(this)?.watched)
      this.addEventListener(
        "loadend",
        () => {
          try {
            if (this.status < 200 || this.status >= 300) {
              error("本次模拟返回 HTTP " + this.status + "，上一场记录保留。");
              return;
            }
            const text =
              this.responseType === "json"
                ? JSON.stringify(this.response)
                : this.responseText;
            deliver(text, body, this.status);
          } catch (e) {
            error(e.message);
          }
        },
        { once: true },
      );
    return send.apply(this, arguments);
  };
})();
