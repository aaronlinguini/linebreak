"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function googleClientSource(bridgeSource) {
  new vm.Script(bridgeSource, { filename: "drive-bridge.js" });
  const body = /^\(\(\) => \{\n([\s\S]*)\n\}\)\(\);\n?$/.exec(bridgeSource);
  if (!body) throw new Error("drive-bridge.js must contain one self-contained bridge function.");
  const source = "// Generated from drive-bridge.js; rebuild with node scripts/build-google-client.cjs.\n" +
    "function exposureBridgeClient_() {\n" + body[1] + "\n}\n";
  new vm.Script(source, { filename: "Client.gs" });
  return source;
}

function buildGoogleClient({ check = false, root = path.resolve(__dirname, "..") } = {}) {
  const source = googleClientSource(fs.readFileSync(path.join(root, "drive-bridge.js"), "utf8"));
  const destination = path.join(root, "google-apps-script", "Client.gs");
  if (check) {
    if (!fs.existsSync(destination) || fs.readFileSync(destination, "utf8") !== source) {
      throw new Error("Client.gs differs from drive-bridge.js; run node scripts/build-google-client.cjs.");
    }
  } else {
    fs.writeFileSync(destination, source);
  }
  return destination;
}

module.exports = { googleClientSource, buildGoogleClient };

if (require.main === module) {
  try {
    const arguments_ = process.argv.slice(2);
    if (arguments_.length > 1 || (arguments_.length && arguments_[0] !== "--check")) {
      throw new Error("Usage: node scripts/build-google-client.cjs [--check]");
    }
    buildGoogleClient({ check: arguments_[0] === "--check" });
    console.log(arguments_[0] === "--check" ? "Google bridge matches drive-bridge.js." : "Built google-apps-script/Client.gs.");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
