async function refreshBadge() {
  const { latest, captureError } = await chrome.storage.local.get([
    "latest",
    "captureError",
  ]);
  await chrome.action.setBadgeText({
    text: captureError ? "!" : latest ? "1" : "",
  });
  await chrome.action.setBadgeBackgroundColor({
    color: captureError ? "#aa532f" : "#146779",
  });
}
chrome.storage.onChanged.addListener(refreshBadge);
chrome.runtime.onInstalled.addListener(refreshBadge);
chrome.runtime.onStartup.addListener(refreshBadge);
