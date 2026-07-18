const archiver = require("archiver");
const { Readable } = require("stream");
const logger = require("./logger");

/**
 * Streams a set of remote files (e.g. Cloudinary URLs) into a ZIP response.
 * @param {Array<{ url: string, name: string }>} files
 */
const generateZip = async (files, zipName = "download.zip", res) => {
  const archive = archiver("zip", { zlib: { level: 9 } });

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${zipName}"`);

  archive.on("warning", (err) => {
    logger.warn("Archiver warning: %o", err);
  });

  archive.on("error", (err) => {
    logger.error("Archiver error: %o", err);
  });

  archive.pipe(res);

  for (const file of files) {
    try {
      const response = await fetch(file.url);
      if (!response.ok || !response.body) {
        logger.warn(`Failed to fetch file for zip, skipping: ${file.url}`);
        continue;
      }
      archive.append(Readable.fromWeb(response.body), { name: file.name });
    } catch (err) {
      logger.warn(`Error fetching file for zip, skipping ${file.url}: %o`, err);
    }
  }

  await archive.finalize();
};

module.exports = generateZip;
