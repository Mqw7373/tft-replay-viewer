async function downloadSession(records) {
  const raw = JSON.stringify({ format: "tft-replay-session/v1", records });
  const stream = new Blob([raw])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  const blob = await new Response(stream).blob(),
    a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download =
    "tft-battles-" + new Date().toISOString().slice(0, 10) + ".json.gz";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
