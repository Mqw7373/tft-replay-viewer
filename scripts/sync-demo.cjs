const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const demo = JSON.parse(
  fs.readFileSync(path.join(root, "examples/demo.json"), "utf8"),
);
require("../src/alphasim.js").parse(demo);
fs.writeFileSync(
  path.join(root, "examples/demo.js"),
  "// Generated from demo.json by scripts/sync-demo.cjs\nwindow.DEMO_LOG=" +
    JSON.stringify(demo).replace(/<\//g, "<\\/") +
    ";\n",
);
