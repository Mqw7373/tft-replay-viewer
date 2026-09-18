const $ = (id) => document.getElementById(id);
let entries = [];
async function rpc(message) {
  const r = await chrome.runtime.sendMessage(message);
  if (!r?.ok) throw new Error(r?.error || "扩展未响应");
  return r.data;
}
async function refresh() {
  entries = await rpc({ type: "list" });
  const { captureError } = await chrome.storage.local.get("captureError");
  $("status").textContent = entries.length
    ? `已保存 ${entries.length} 场 · 最近 ${new Date(entries.at(-1).capturedAt).toLocaleString()}`
    : "尚未捕获战斗，请在 AlphaSim 手动模拟。";
  $("error").textContent = captureError || "";
  for (const id of ["open", "download"]) $(id).disabled = !entries.length;
  $("clear").disabled = !entries.length && !captureError;
}
$("open").onclick = () =>
  chrome.tabs.create({
    url: chrome.runtime.getURL("viewer/index.html#history"),
  });
$("download").onclick = async () => {
  try {
    $("download").disabled = true;
    const snapshot = entries.slice(),
      records = [];
    for (const e of snapshot)
      records.push(
        await CaptureCodec.decode(await rpc({ type: "get", id: e.id })),
      );
    await downloadSession(records);
  } catch (e) {
    $("error").textContent = e.message;
  } finally {
    $("download").disabled = !entries.length;
  }
};
$("clear").onclick = async () => {
  if (!confirm("清除全部本地战斗记录？需要留档请先导出。")) return;
  try {
    await rpc({ type: "clear" });
    await refresh();
  } catch (e) {
    $("error").textContent = e.message;
  }
};
chrome.storage.onChanged.addListener(() => refresh().catch(() => {}));
refresh().catch((e) => {
  $("error").textContent = e.message;
});
