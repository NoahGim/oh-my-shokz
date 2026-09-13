const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { resolveUnpackedAsarPath } = require("../bundled-tool-path");

test("maps packaged ASAR tool paths to their real unpacked location", () => {
  const packagedPath = path.join(
    path.sep,
    "Applications",
    "OhMyShokz.app",
    "Contents",
    "Resources",
    "app.asar",
    "node_modules",
    "ffmpeg-static",
    "ffmpeg"
  );

  assert.equal(
    resolveUnpackedAsarPath(packagedPath),
    packagedPath.replace(
      `${path.sep}app.asar${path.sep}`,
      `${path.sep}app.asar.unpacked${path.sep}`
    )
  );
});

test("leaves development paths unchanged", () => {
  const developmentPath = path.join(
    path.sep,
    "workspace",
    "node_modules",
    "ffmpeg-static",
    "ffmpeg"
  );

  assert.equal(resolveUnpackedAsarPath(developmentPath), developmentPath);
});
