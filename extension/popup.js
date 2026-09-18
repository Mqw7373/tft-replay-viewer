const $ = (id) => document.getElementById(id);
let latest;
async function refresh() {
  const state = await chrome.storage.local.get(["latest", "captureError"]);
  latest = state.latest;
  $("status").textContent = latest
    ? "已保存一场 · " + new Date(latest.capturedAt).toLocaleString()
    : "尚未捕获战斗，请在 AlphaSim 手动模拟一次。";
  $("error").textContent = state.captureError || "";
  for (const id of ["open", "download"]) $(id).disabled = !latest;
  $("clear").disabled = !latest && !state.captureError;
}
$("open").onclick = () =>
  chrome.tabs.create({
    url: chrome.runtime.getURL(
      "viewer/index.html#capture=" + encodeURIComponent(latest.id),
    ),
  });
$("download").onclick = async () => {
  try {
    const record = await CaptureCodec.decode(latest),
      a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([JSON.stringify(record, null, 2)], { type: "application/json" }),
    );
    a.download =
      "alphasim-battle-" + latest.capturedAt.replace(/[:.]/g, "-") + ".json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } catch (e) {
    $("error").textContent = e.message;
  }
};
$("clear").onclick = async () => {
  await chrome.storage.local.remove(["latest", "captureError"]);
  await refresh();
};
chrome.storage.onChanged.addListener(refresh);
refresh().catch((e) => {
  $("error").textContent = e.message;
});
