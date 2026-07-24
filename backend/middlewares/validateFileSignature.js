// Multer's fileFilter only checks the client-supplied Content-Type for the
// part (file.mimetype) — that's just a header the client sets, trivial to
// spoof (rename a .exe to .pdf and claim application/pdf). This checks the
// actual bytes of the uploaded file after multer has buffered it, so a
// mislabeled or malicious upload can't pass as a PDF just by claiming to be
// one. Every real PDF starts with the literal bytes "%PDF-" per spec.
const PDF_SIGNATURE = Buffer.from("%PDF-", "ascii");

const hasValidPdfSignature = (buffer) =>
  Buffer.isBuffer(buffer) &&
  buffer.length >= PDF_SIGNATURE.length &&
  buffer.subarray(0, PDF_SIGNATURE.length).equals(PDF_SIGNATURE);

// Mount after upload.single(...) so req.file.buffer is already populated.
// Leaves a missing file for the controller's own "file is required" check.
const requirePdfSignature = (req, res, next) => {
  if (!req.file) return next();

  if (!hasValidPdfSignature(req.file.buffer)) {
    return res.status(400).json({ success: false, message: "Uploaded file is not a valid PDF" });
  }

  next();
};

module.exports = { requirePdfSignature, hasValidPdfSignature };
