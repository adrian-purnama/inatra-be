import multer from "multer";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

/** `multipart/form-data` with field `file`, any file type, max 10 MiB. */
export const opportunityAttachmentUpload = upload.single("file");
