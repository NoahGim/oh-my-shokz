const path = require("path");

function resolveUnpackedAsarPath(filePath) {
  if (typeof filePath !== "string") return filePath;

  const asarSegment = `${path.sep}app.asar${path.sep}`;
  if (!filePath.includes(asarSegment)) return filePath;

  return filePath.replace(
    asarSegment,
    `${path.sep}app.asar.unpacked${path.sep}`
  );
}

module.exports = { resolveUnpackedAsarPath };
