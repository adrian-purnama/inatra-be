import multer from "multer";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const name = String(file.originalname ?? "").toLowerCase();
    const mime = String(file.mimetype ?? "").toLowerCase();
    if (
      name.endsWith(".csv") ||
      mime.includes("csv") ||
      mime === "application/vnd.ms-excel" ||
      mime === "text/plain"
    ) {
      cb(null, true);
      return;
    }
    cb(new Error("Only CSV files are allowed"));
  },
});

/** `multipart/form-data` with field name `file` (max 20 MiB). */
export const vendorCsvUpload = upload.single("file");
