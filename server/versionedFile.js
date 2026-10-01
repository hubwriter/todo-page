import fs from 'fs/promises';
import { createHash, randomUUID } from 'crypto';
import { dirname, join } from 'path';

const writeQueues = new Map();

export class BackupError extends Error {
  constructor(resource, cause) {
    super(`Failed to create ${resource} backup`, { cause });
    this.name = 'BackupError';
    this.resource = resource;
  }
}

export function hashBytes(content) {
  return createHash('sha256').update(content).digest('hex');
}

export async function resolveVersionedFilePath(filePath, resource) {
  try {
    const stats = await fs.lstat(filePath);
    if (!stats.isSymbolicLink()) return filePath;
    try {
      return await fs.realpath(filePath);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        throw new Error(`Configured ${resource} file is a dangling symbolic link: ${filePath}`, { cause: error });
      }
      throw error;
    }
  } catch (error) {
    if (error?.code === 'ENOENT') return filePath;
    throw error;
  }
}

export async function readVersionedFile(filePath) {
  const bytes = await fs.readFile(filePath);
  return {
    bytes,
    content: bytes.toString('utf-8'),
    version: hashBytes(bytes)
  };
}

export function enqueueResourceWrite(resource, operation) {
  const previous = writeQueues.get(resource) || Promise.resolve();
  const next = previous.catch(() => {}).then(operation);
  writeQueues.set(resource, next);
  return next.finally(() => {
    if (writeQueues.get(resource) === next) {
      writeQueues.delete(resource);
    }
  });
}

export function ensureVersionedFileExists({
  resource,
  filePath,
  defaultContent,
  beforePublish
}) {
  return enqueueResourceWrite(resource, async () => {
    const temporaryPath = join(dirname(filePath), `.${resource}-${randomUUID()}.tmp`);

    try {
      const handle = await fs.open(temporaryPath, 'wx');
      try {
        await handle.writeFile(defaultContent, { encoding: 'utf-8' });
        await handle.sync();
      } finally {
        await handle.close();
      }

      if (beforePublish) await beforePublish();

      try {
        await fs.link(temporaryPath, filePath);
        return { created: true };
      } catch (error) {
        if (error?.code === 'EEXIST') {
          return { created: false };
        }
        throw error;
      }
    } finally {
      await fs.unlink(temporaryPath).catch(() => {});
    }
  });
}

export async function conditionalAtomicWrite({
  resource,
  filePath,
  baseVersion,
  content,
  createBackup,
  validateCurrent,
  beforeRename
}) {
  return enqueueResourceWrite(resource, async () => {
    const current = await readVersionedFile(filePath);
    if (current.version !== baseVersion) {
      return { status: 'conflict', latest: current };
    }
    const currentValidation = validateCurrent?.(current);
    if (currentValidation && currentValidation.ok === false) {
      return { status: 'rejected', latest: current, error: currentValidation.error };
    }

    const nextBytes = Buffer.from(content, 'utf-8');
    const temporaryPath = join(dirname(filePath), `.${resource}-${randomUUID()}.tmp`);
    const fileMode = (await fs.stat(filePath)).mode & 0o7777;

    try {
      const handle = await fs.open(temporaryPath, 'wx');
      try {
        await handle.writeFile(nextBytes);
        await handle.chmod(fileMode);
        await handle.sync();
      } finally {
        await handle.close();
      }

      if (beforeRename) await beforeRename();

      const beforeBackup = await readVersionedFile(filePath);
      if (beforeBackup.version !== current.version) {
        return { status: 'conflict', latest: beforeBackup };
      }

      if (createBackup && !nextBytes.equals(current.bytes)) {
        try {
          await createBackup(current.content);
        } catch (error) {
          throw new BackupError(resource, error);
        }
      }

      const finalCurrent = await readVersionedFile(filePath);
      if (finalCurrent.version !== current.version) {
        return { status: 'conflict', latest: finalCurrent };
      }

      await fs.rename(temporaryPath, filePath);
      const written = await readVersionedFile(filePath);
      return { status: 'written', written };
    } finally {
      await fs.unlink(temporaryPath).catch(() => {});
    }
  });
}
