// Build an unpacked extension using only files from this repository.
const fs = require("node:fs"),
  path = require("node:path");
const root = path.join(__dirname, ".."),
  out = path.join(root, "dist/extension");
fs.mkdirSync(out, { recursive: true });
for (const name of [
  "manifest.json",
  "capture.js",
  "bridge.js",
  "background.js",
  "popup.html",
  "popup.css",
  "popup.js",
])
  fs.copyFileSync(path.join(root, "extension", name), path.join(out, name));
fs.mkdirSync(path.join(out, "viewer"), { recursive: true });
for (const dir of ["src", "examples"])
  fs.cpSync(path.join(root, dir), path.join(out, "viewer", dir), {
    recursive: true,
  });
fs.copyFileSync(path.join(root, "LICENSE"), path.join(out, "LICENSE"));
fs.copyFileSync(
  path.join(root, "THIRD_PARTY_NOTICES.md"),
  path.join(out, "THIRD_PARTY_NOTICES.md"),
);
const html = fs
  .readFileSync(path.join(root, "index.html"), "utf8")
  .replace(
    'href="extension.html"',
    'href="https://mqw7373.github.io/tft-replay-viewer/extension.html"',
  )
  .replace(
    "</html>",
    '<script defer src="src/capture-codec.js"></script><script defer src="src/extension-import.js"></script></html>',
  );
fs.writeFileSync(path.join(out, "viewer/index.html"), html);
console.log("Unpacked extension: dist/extension");
