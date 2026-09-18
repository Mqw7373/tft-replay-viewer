// A single compressed local record fits within the extension's default storage quota.
window.CaptureCodec = {
  async encode(record) {
    const json = JSON.stringify(record);
    const rawBytes = new TextEncoder().encode(json).length;
    if (rawBytes > 50 * 1024 * 1024)
      throw new Error("记录超过 50 MB，上一场记录保留。");
    const bytes = new Uint8Array(
      await new Response(
        new Blob([json]).stream().pipeThrough(new CompressionStream("gzip")),
      ).arrayBuffer(),
    );
    if (bytes.length > 6 * 1024 * 1024)
      throw new Error("压缩记录超过 6 MB，上一场记录保留。");
    let binary = "";
    for (let i = 0; i < bytes.length; i += 32768)
      binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
    return {
      id: crypto.randomUUID(),
      rawBytes,
      capturedAt: record.capturedAt,
      encoding: "gzip-base64",
      data: btoa(binary),
    };
  },
  async decode(entry) {
    if (
      entry?.encoding !== "gzip-base64" ||
      typeof entry.data !== "string" ||
      entry.data.length > 8 * 1024 * 1024
    )
      throw new Error("本地记录格式无效。");
    const binary = atob(entry.data),
      bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const stream = new Blob([bytes])
      .stream()
      .pipeThrough(new DecompressionStream("gzip"));
    const reader = stream.getReader(),
      decoder = new TextDecoder();
    let size = 0,
      text = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 50 * 1024 * 1024) {
        await reader.cancel();
        throw new Error("本地记录解压后过大。");
      }
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  },
};
