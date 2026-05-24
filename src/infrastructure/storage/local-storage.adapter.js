const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const UPLOAD_ROOT = path.join(process.cwd(), 'uploads', 'tenant-files');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * @param {{ merchantId: string, branchId?: string|null, buffer: Buffer, extension: string }} input
 */
async function storeLocal({ merchantId, branchId, buffer, extension }) {
  const safeExt = extension.replace(/[^a-zA-Z0-9.]/g, '') || 'bin';
  const key = `${merchantId}/${branchId || 'global'}/${crypto.randomUUID()}.${safeExt}`;
  const absPath = path.join(UPLOAD_ROOT, key);
  ensureDir(path.dirname(absPath));
  await fs.promises.writeFile(absPath, buffer);
  return { provider: 'local', storageKey: key, absolutePath: absPath };
}

async function readLocal(storageKey) {
  const absPath = path.join(UPLOAD_ROOT, storageKey);
  return fs.promises.readFile(absPath);
}

async function deleteLocal(storageKey) {
  const absPath = path.join(UPLOAD_ROOT, storageKey);
  if (fs.existsSync(absPath)) {
    await fs.promises.unlink(absPath);
  }
}

module.exports = { storeLocal, readLocal, deleteLocal, UPLOAD_ROOT };
