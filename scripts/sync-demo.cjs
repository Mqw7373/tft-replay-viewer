const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const examples = require("../examples/index.json").map((entry) => {
  const record = JSON.parse(
    fs.readFileSync(path.join(root, "examples", entry.file), "utf8"),
  );
  require("../src/alphasim.js").parse(record);
  return { ...entry, record };
});
fs.writeFileSync(
  path.join(root, "examples/demo.js"),
  "// Generated from examples/index.json and its fixtures by scripts/sync-demo.cjs\nwindow.DEMO_EXAMPLES=" +
    JSON.stringify(examples).replace(/<\//g, "<\\/") +
    ";\nwindow.DEMO_LOG=window.DEMO_EXAMPLES[0].record;\n",
);
