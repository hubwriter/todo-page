import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import { watch } from 'chokidar';
import { dirname, join, resolve, normalize } from 'path';
import { fileURLToPath } from 'url';
import rateLimit from 'express-rate-limit';
import { createServer as createViteServer } from 'vite';
import helmet from 'helmet';
import {
  MAX_BODY_SIZE,
  MAX_TODO_SIZE,
  MAX_IMAGE_SIZE,
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX_REQUESTS,
  ALLOWED_IMAGE_EXTENSIONS,
  IMAGE_CONTENT_TYPES,
  MAX_LOCAL_FILE_SIZE,
  DEFAULT_TODO_CONTENT,
  DEFAULT_LINKS_CONTENT
} from './src/constants.js';
import { validatePath, validateFileExtension } from './server/pathUtils.js';
import { sanitizeLinkCategories } from './server/linkValidation.js';
import { isPathReferencedByCategories, getLocalFileContentType } from './server/localFile.js';
import { createBackup, createResourceBackup, listBackups, readBackup } from './server/backups.js';
import {
  BackupError,
  conditionalAtomicWrite,
  ensureVersionedFileExists,
  readVersionedFile,
  resolveVersionedFilePath
} from './server/versionedFile.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const isDevelopment = process.env.NODE_ENV !== 'production';

// Security middleware
app.use(helmet({
  contentSecurityPolicy: isDevelopment ? false : {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"]
    }
  },
  // The dev server is plain HTTP. Sending HSTS would make browsers cache a
  // policy for localhost and force-upgrade every http://localhost:PORT request
  // to https://, which fails and breaks other local projects on any port.
  strictTransportSecurity: !isDevelopment,
  crossOriginEmbedderPolicy: false
}));

// Middleware
app.use(cors());
app.use(express.json({ limit: `${MAX_BODY_SIZE}b` }));

// Rate limiting for file operations
const fileOperationLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX_REQUESTS,
  message: 'Too many requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Load configuration
async function loadConfig() {
  try {
    // Normalize and resolve the config path to prevent directory traversal
    const configPath = normalize(resolve(join(__dirname, 'config.json')));

    // Security check: ensure the config file is within the project directory
    if (!configPath.startsWith(__dirname)) {
      console.warn('Config file path traversal attempt detected');
      return {};
    }

    const configData = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(configData);
    return config;
  } catch (error) {
    // Config file doesn't exist or is invalid, return empty object
    return {};
  }
}

// Get TODO file path from config, environment, or default
async function getTodoFilePath() {
  const config = await loadConfig();

  // Priority: environment variable > config file > default
  let filePath;
  if (process.env.TODO_FILE_PATH) {
    filePath = process.env.TODO_FILE_PATH;
  } else if (config.todoFilePath) {
    filePath = config.todoFilePath;
  } else {
    filePath = join(__dirname, 'todo.md');
  }

  // Normalize and resolve the path to prevent directory traversal
  filePath = normalize(resolve(filePath));

  // Security validation: ensure the path doesn't contain suspicious patterns
  if (filePath.includes('..')) {
    console.warn('Suspicious path pattern detected, using default');
    return normalize(resolve(join(__dirname, 'todo.md')));
  }

  return filePath;
}

// Keep the configured path for companion files and backups, while using the
// resolved target for versioned I/O so atomic replacement preserves symlinks.
const CONFIGURED_TODO_FILE_PATH = await getTodoFilePath();
const TODO_FILE_PATH = await resolveVersionedFilePath(CONFIGURED_TODO_FILE_PATH, 'todo');

console.log(`Using todo file at: ${TODO_FILE_PATH}`);

// Get the links file path from config, environment, or default (alongside the todo file)
async function getLinksFilePath(todoFilePath) {
  const config = await loadConfig();

  // Priority: environment variable > config file > default
  let filePath;
  if (process.env.LINKS_FILE_PATH) {
    filePath = process.env.LINKS_FILE_PATH;
  } else if (config.linksFilePath) {
    filePath = config.linksFilePath;
  } else {
    filePath = join(dirname(todoFilePath), 'links.json');
  }

  // Normalize and resolve the path to prevent directory traversal
  filePath = normalize(resolve(filePath));

  // Security validation: ensure the path doesn't contain suspicious patterns
  if (filePath.includes('..')) {
    console.warn('Suspicious links path pattern detected, using default');
    return normalize(resolve(join(dirname(todoFilePath), 'links.json')));
  }

  return filePath;
}

// Preserve the configured path for backup placement while resolving the target
// path for versioned I/O so atomic writes do not replace a symlink.
const CONFIGURED_LINKS_FILE_PATH = await getLinksFilePath(CONFIGURED_TODO_FILE_PATH);
const LINKS_FILE_PATH = await resolveVersionedFilePath(CONFIGURED_LINKS_FILE_PATH, 'links');

console.log(`Using links file at: ${LINKS_FILE_PATH}`);

function hasLegacyLinks(categories) {
  return categories.some((category) =>
    Array.isArray(category?.links)
    && category.links.some((link) => typeof link?.id !== 'string' || !link.id)
  );
}

async function readLinksFile({ migrateLegacy = true } = {}) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const current = await readVersionedFile(LINKS_FILE_PATH);
    let parsed;
    try {
      parsed = JSON.parse(current.content);
    } catch (error) {
      return {
        invalid: true,
        rawContent: current.content,
        version: current.version,
        error: `links.json contains invalid JSON: ${error.message}`
      };
    }

    const validation = sanitizeLinkCategories(parsed);
    if (!validation.isValid) {
      return {
        invalid: true,
        rawContent: current.content,
        version: current.version,
        error: validation.error
      };
    }
    if (!migrateLegacy || !hasLegacyLinks(parsed)) {
      return {
        invalid: false,
        categories: validation.value,
        rawContent: current.content,
        version: current.version
      };
    }

    const serialized = JSON.stringify(validation.value, null, 2);
    const result = await conditionalAtomicWrite({
      resource: 'links',
      filePath: LINKS_FILE_PATH,
      baseVersion: current.version,
      content: serialized,
      missingContent: '[]',
      validateCurrent: ({ content }) => {
        try {
          const latest = sanitizeLinkCategories(JSON.parse(content));
          return latest.isValid
            ? { ok: true }
            : { ok: false, error: latest.error };
        } catch (error) {
          return { ok: false, error: `links.json contains invalid JSON: ${error.message}` };
        }
      },
      createBackup: (previousContent) => createResourceBackup(CONFIGURED_LINKS_FILE_PATH, previousContent)
    });
    if (result.status === 'written') {
      return {
        invalid: false,
        categories: validation.value,
        rawContent: result.written.content,
        version: result.written.version
      };
    }
    if (result.status === 'rejected') {
      return {
        invalid: true,
        rawContent: result.latest.content,
        version: result.latest.version,
        error: result.error
      };
    }
  }
  throw new Error('Links changed repeatedly while assigning durable link IDs');
}

// Ensure the file exists
async function ensureFileExists() {
  const { created } = await ensureVersionedFileExists({
    resource: 'todo',
    filePath: TODO_FILE_PATH,
    defaultContent: DEFAULT_TODO_CONTENT
  });
  if (created) {
    console.log('Created default todo.md file');
  }
}

// Get the content of the todo file
app.get('/api/todo', fileOperationLimiter, async (req, res) => {
  try {
    await ensureFileExists();
    const { content, version } = await readVersionedFile(TODO_FILE_PATH);
    res.json({ content, version });
  } catch (error) {
    console.error('Error reading file:', error);
    res.status(500).json({ error: 'Failed to read todo file' });
  }
});

// Update the content of the todo file
app.post('/api/todo', fileOperationLimiter, async (req, res) => {
  try {
    const { content, baseVersion } = req.body;

    if (typeof baseVersion !== 'string' || !baseVersion) {
      return res.status(428).json({ error: 'baseVersion is required' });
    }

    // Input validation
    if (typeof content !== 'string') {
      return res.status(400).json({ error: 'Content must be a string' });
    }

    // Security: limit content size to prevent DoS
    if (content.length > MAX_TODO_SIZE) {
      return res.status(413).json({ error: `Content too large. Maximum size is ${MAX_TODO_SIZE / (1024 * 1024)}MB` });
    }

    const result = await conditionalAtomicWrite({
      resource: 'todo',
      filePath: TODO_FILE_PATH,
      baseVersion,
      content,
      missingContent: DEFAULT_TODO_CONTENT,
      createBackup: (previousContent) => createBackup(CONFIGURED_TODO_FILE_PATH, previousContent)
    });

    if (result.status === 'conflict') {
      return res.status(409).json({
        error: 'Todo content changed since it was loaded',
        content: result.latest.content,
        version: result.latest.version
      });
    }
    res.json({ content: result.written.content, version: result.written.version });
  } catch (error) {
    console.error('Error writing file:', error);
    if (error instanceof BackupError) {
      return res.status(500).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to write todo file' });
  }
});

// List the most recent backups (newest first)
app.get('/api/backups', fileOperationLimiter, async (req, res) => {
  try {
    const backups = await listBackups(CONFIGURED_TODO_FILE_PATH);
    res.json({ backups });
  } catch (error) {
    console.error('Error listing backups:', error);
    res.status(500).json({ error: 'Failed to list backups' });
  }
});

// Get the content of a single backup file
app.get('/api/backups/:filename', fileOperationLimiter, async (req, res) => {
  try {
    const { filename } = req.params;
    const content = await readBackup(CONFIGURED_TODO_FILE_PATH, filename);
    if (content === null) {
      return res.status(404).json({ error: 'Backup not found' });
    }
    res.json({ filename, content });
  } catch (error) {
    console.error('Error reading backup:', error);
    res.status(500).json({ error: 'Failed to read backup' });
  }
});

// Ensure the links file exists
async function ensureLinksFileExists() {
  const { created } = await ensureVersionedFileExists({
    resource: 'links',
    filePath: LINKS_FILE_PATH,
    defaultContent: DEFAULT_LINKS_CONTENT
  });
  if (created) {
    console.log('Created default links.json file');
  }
}

// Validate and sanitize the links payload (see server/linkValidation.js).

// Get the link categories
app.get('/api/links', fileOperationLimiter, async (req, res) => {
  try {
    await ensureLinksFileExists();
    const loaded = await readLinksFile();
    if (loaded.invalid) {
      return res.json({
        categories: null,
        rawContent: loaded.rawContent,
        version: loaded.version,
        invalid: true,
        error: loaded.error
      });
    }

    res.json({
      categories: loaded.categories,
      rawContent: loaded.rawContent,
      version: loaded.version,
      invalid: false
    });
  } catch (error) {
    console.error('Error reading links file:', error);
    res.status(500).json({ error: 'Failed to read links file' });
  }
});

// Update the link categories
app.post('/api/links', fileOperationLimiter, async (req, res) => {
  try {
    const { baseVersion, replaceInvalid = false } = req.body;
    if (typeof baseVersion !== 'string' || !baseVersion) {
      return res.status(428).json({ error: 'baseVersion is required' });
    }

    const validation = sanitizeLinkCategories(req.body.categories);
    if (!validation.isValid) {
      return res.status(400).json({ error: validation.error });
    }

    const serialized = JSON.stringify(validation.value, null, 2);

    // Security: limit content size to prevent DoS
    if (serialized.length > MAX_TODO_SIZE) {
      return res.status(413).json({ error: `Content too large. Maximum size is ${MAX_TODO_SIZE / (1024 * 1024)}MB` });
    }

    const result = await conditionalAtomicWrite({
      resource: 'links',
      filePath: LINKS_FILE_PATH,
      baseVersion,
      content: serialized,
      missingContent: '[]',
      validateCurrent: ({ content }) => {
        if (replaceInvalid) return { ok: true };
        try {
          const currentValidation = sanitizeLinkCategories(JSON.parse(content));
          return currentValidation.isValid
            ? { ok: true }
            : { ok: false, error: 'links.json is invalid and requires explicit replacement' };
        } catch {
          return { ok: false, error: 'links.json is invalid and requires explicit replacement' };
        }
      },
      createBackup: (previousContent) => createResourceBackup(CONFIGURED_LINKS_FILE_PATH, previousContent)
    });

    if (result.status === 'conflict') {
      const latest = await readLinksFile();
      return res.status(409).json({
        error: 'Links changed since they were loaded',
        categories: latest.invalid ? null : latest.categories,
        rawContent: latest.rawContent,
        version: latest.version,
        invalid: latest.invalid,
        invalidError: latest.invalid ? latest.error : ''
      });
    }
    if (result.status === 'rejected') {
      return res.status(422).json({
        error: result.error,
        rawContent: result.latest.content,
        version: result.latest.version,
        invalid: true
      });
    }

    res.json({
      categories: validation.value,
      rawContent: result.written.content,
      version: result.written.version,
      invalid: false
    });
  } catch (error) {
    console.error('Error writing links file:', error);
    if (error instanceof BackupError) {
      return res.status(500).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to write links file' });
  }
});

// Serve local image files
app.get('/api/image', fileOperationLimiter, async (req, res) => {
  try {
    const { path } = req.query;

    if (!path) {
      return res.status(400).json({ error: 'Image path is required' });
    }

    // Validate path security
    const pathValidation = validatePath(path);
    if (!pathValidation.isValid) {
      return res.status(403).json({ error: pathValidation.error });
    }

    const normalizedPath = pathValidation.normalizedPath;

    // Validate file extension
    const extensionValidation = validateFileExtension(normalizedPath, ALLOWED_IMAGE_EXTENSIONS);
    if (!extensionValidation.isValid) {
      return res.status(400).json({ error: 'Invalid image file type' });
    }

    // Check if file exists and is readable
    try {
      const stats = await fs.stat(normalizedPath);

      // Ensure it's a file, not a directory
      if (!stats.isFile()) {
        return res.status(400).json({ error: 'Path is not a file' });
      }

      // Check file size to prevent serving huge files
      if (stats.size > MAX_IMAGE_SIZE) {
        return res.status(413).json({ error: 'File too large' });
      }

      await fs.access(normalizedPath, fs.constants.R_OK);
    } catch {
      return res.status(404).json({ error: 'Image not found' });
    }

    // Read and serve the file
    const imageBuffer = await fs.readFile(normalizedPath);
    const contentType = IMAGE_CONTENT_TYPES[extensionValidation.extension] || 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    res.setHeader('X-Content-Type-Options', 'nosniff'); // Prevent MIME sniffing
    res.send(imageBuffer);
  } catch (error) {
    console.error('Error serving image:', error);
    res.status(500).json({ error: 'Failed to serve image' });
  }
});

// Only files referenced by a saved file:// link may be served, so that this
// endpoint cannot be used to read arbitrary local files.
async function isPathReferencedByLink(normalizedPath) {
  try {
    const content = await fs.readFile(LINKS_FILE_PATH, 'utf-8');
    return isPathReferencedByCategories(JSON.parse(content), normalizedPath);
  } catch {
    return false;
  }
}

// Serve a local file referenced by a saved file:// link (browsers block
// navigating to file:// URLs directly from an http page)
app.get('/api/local-file', fileOperationLimiter, async (req, res) => {
  try {
    const { path: requestedPath } = req.query;

    if (!requestedPath || typeof requestedPath !== 'string') {
      return res.status(400).json({ error: 'File path is required' });
    }

    // Validate path security (prefix allow-list, no traversal, no sensitive dirs)
    const pathValidation = validatePath(requestedPath);
    if (!pathValidation.isValid) {
      return res.status(403).json({ error: pathValidation.error });
    }

    const normalizedPath = pathValidation.normalizedPath;

    // Only serve files the user has explicitly saved as a file:// link
    if (!(await isPathReferencedByLink(normalizedPath))) {
      return res.status(403).json({ error: 'File is not a saved link' });
    }

    let stats;
    try {
      stats = await fs.stat(normalizedPath);
    } catch {
      return res.status(404).json({ error: 'File not found' });
    }
    if (!stats.isFile()) {
      return res.status(400).json({ error: 'Path is not a file' });
    }
    if (stats.size > MAX_LOCAL_FILE_SIZE) {
      return res.status(413).json({ error: 'File too large' });
    }

    const fileBuffer = await fs.readFile(normalizedPath);

    res.setHeader('Content-Type', getLocalFileContentType(normalizedPath));
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(fileBuffer);
  } catch (error) {
    console.error('Error serving local file:', error);
    res.status(500).json({ error: 'Failed to serve file' });
  }
});

// WebSocket-like endpoint for file change notifications
let changeClients = [];

app.get(['/api/watch', '/api/todo/watch'], fileOperationLimiter, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  changeClients.push(res);
  res.flushHeaders?.();

  req.on('close', () => {
    changeClients = changeClients.filter(client => client !== res);
  });
});

// Watch for file changes
const watcher = watch([TODO_FILE_PATH, LINKS_FILE_PATH], {
  persistent: true,
  ignoreInitial: true,
  awaitWriteFinish: {
    stabilityThreshold: 50,
    pollInterval: 10
  }
});

const lastNotifiedVersions = new Map();

async function notifyResourceChange(filePath) {
  const resource = filePath === TODO_FILE_PATH ? 'todo' : 'links';
  let version = null;
  try {
    ({ version } = await readVersionedFile(filePath));
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      console.error(`Error reading changed ${resource} file:`, error);
    }
  }
  if (lastNotifiedVersions.get(resource) === version) return;
  lastNotifiedVersions.set(resource, version);
  const payload = JSON.stringify({ resource, version });
  changeClients.forEach(client => {
    client.write(`data: ${payload}\n\n`);
  });
}

watcher.on('add', notifyResourceChange);
watcher.on('change', notifyResourceChange);
watcher.on('unlink', notifyResourceChange);

// Start server with Vite integration in development
async function startServer() {
  if (isDevelopment) {
    // In development, use Vite's middleware for HMR
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });

    // Use vite's connect instance as middleware
    app.use(vite.middlewares);

    console.log('Development mode: Vite middleware enabled');
  } else {
    // In production, serve the built files
    app.use(express.static(join(__dirname, 'dist')));

    // SPA fallback - serve index.html for all non-API routes
    app.get('*', (req, res) => {
      res.sendFile(join(__dirname, 'dist', 'index.html'));
    });

    console.log('Production mode: Serving static files from dist/');
  }

  await ensureFileExists();
  await ensureLinksFileExists();

  // Global error handler - must be defined after all routes
  app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);

    // In production, don't leak error details
    if (!isDevelopment) {
      res.status(500).json({ error: 'An unexpected error occurred' });
    } else {
      res.status(500).json({
        error: 'An unexpected error occurred',
        details: err.message
      });
    }
  });

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Todo file: ${TODO_FILE_PATH}`);
    console.log(`Mode: ${isDevelopment ? 'development' : 'production'}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
