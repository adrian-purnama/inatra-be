import multer from "multer";

const ALLOWED_LOGO_MIME_TYPES = new Set(["image/jpeg", "image/png"]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const mimetype = String(file.mimetype).toLowerCase();
    if (ALLOWED_LOGO_MIME_TYPES.has(mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only JPG, JPEG, and PNG files are allowed"));
    }
  },
});

/** `multipart/form-data` with field name `file` (max 10 MiB, jpg/jpeg/png only). */
export const adminLogoUpload = upload.single("file");
