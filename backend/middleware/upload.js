const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.pdf': 'application/pdf',
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  // Random names: the original filename is user-controlled and must never
  // reach the filesystem (path traversal, collisions, guessable URLs).
  filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED[ext] && ALLOWED[ext] === file.mimetype) return cb(null, true);
    const err = new Error('Only JPG, PNG or PDF files are allowed');
    err.status = 400;
    return cb(err);
  },
});

module.exports = upload;
module.exports.UPLOAD_DIR = UPLOAD_DIR;
module.exports.ALLOWED = ALLOWED;
