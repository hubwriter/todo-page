import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import { watch } from 'chokidar';
import { dirname, join, resolve, normalize } from 'path';
import { fileURLToPath } from 'url';
import rateLimit from 'express-rate-limit';
import { createServer as createViteServer } from 'vite';
import helmet from 'helmet';

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
  crossOriginEmbedderPolicy: false
}));

// Middleware
app.use(cors());
app.use(express.json({ limit: '1mb' })); // Limit request body size to prevent DoS

// Rate limiting for file operations
const fileOperationLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // limit each IP to 60 requests per minute
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

// Initialize TODO file path
const TODO_FILE_PATH = await getTodoFilePath();

console.log(`Using todo file at: ${TODO_FILE_PATH}`);

// Ensure the file exists
async function ensureFileExists() {
  try {
    await fs.access(TODO_FILE_PATH);
  } catch {
    const defaultContent = `# Priority

# Other

# Done
`;
    await fs.writeFile(TODO_FILE_PATH, defaultContent, 'utf-8');
    console.log('Created default todo.md file');
  }
}

// Get the content of the todo file
app.get('/api/todo', fileOperationLimiter, async (req, res) => {
  try {
    await ensureFileExists();
    const content = await fs.readFile(TODO_FILE_PATH, 'utf-8');
    res.json({ content });
  } catch (error) {
    console.error('Error reading file:', error);
    res.status(500).json({ error: 'Failed to read todo file' });
  }
});

// Update the content of the todo file
app.post('/api/todo', fileOperationLimiter, async (req, res) => {
  try {
    const { content } = req.body;

    // Input validation
    if (typeof content !== 'string') {
      return res.status(400).json({ error: 'Content must be a string' });
    }

    // Security: limit content size to prevent DoS (5MB max)
    if (content.length > 5 * 1024 * 1024) {
      return res.status(413).json({ error: 'Content too large. Maximum size is 5MB' });
    }

    await fs.writeFile(TODO_FILE_PATH, content, 'utf-8');
    res.json({ success: true });
  } catch (error) {
    console.error('Error writing file:', error);
    res.status(500).json({ error: 'Failed to write todo file' });
  }
});

// Serve local image files
app.get('/api/image', fileOperationLimiter, async (req, res) => {
  try {
    const { path } = req.query;

    if (!path) {
      return res.status(400).json({ error: 'Image path is required' });
    }

    // Security: validate and normalize the path
    const normalizedPath = normalize(resolve(path));

    // Prevent directory traversal
    if (normalizedPath.includes('..') || path.includes('..')) {
      return res.status(403).json({ error: 'Invalid path' });
    }

    // Security: Only allow absolute paths starting with /Users/ (macOS) or /home/ (Linux)
    // This prevents accessing system files
    if (!normalizedPath.startsWith('/Users/') && !normalizedPath.startsWith('/home/')) {
      return res.status(403).json({ error: 'Access denied: Invalid path location' });
    }

    // Additional security: block access to hidden files and sensitive directories
    const pathParts = normalizedPath.split('/').filter(Boolean);
    const blockedPatterns = ['.ssh', '.aws', '.config', 'node_modules', '.git', '.env'];
    if (pathParts.some(part => part.startsWith('.') || blockedPatterns.includes(part))) {
      return res.status(403).json({ error: 'Access denied: Sensitive directory' });
    }

    // Validate file extension to ensure it's an image
    const ext = normalizedPath.toLowerCase().split('.').pop();
    const allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'];
    if (!allowedExtensions.includes(ext)) {
      return res.status(400).json({ error: 'Invalid image file type' });
    }

    // Check if file exists and is readable
    try {
      const stats = await fs.stat(normalizedPath);
      // Ensure it's a file, not a directory
      if (!stats.isFile()) {
        return res.status(400).json({ error: 'Path is not a file' });
      }
      // Check file size to prevent serving huge files (max 10MB)
      if (stats.size > 10 * 1024 * 1024) {
        return res.status(413).json({ error: 'File too large' });
      }
      await fs.access(normalizedPath, fs.constants.R_OK);
    } catch {
      return res.status(404).json({ error: 'Image not found' });
    }

    // Read and serve the file
    const imageBuffer = await fs.readFile(normalizedPath);

    // Determine content type based on file extension
    const contentTypes = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'svg': 'image/svg+xml',
      'bmp': 'image/bmp',
      'ico': 'image/x-icon'
    };

    const contentType = contentTypes[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    res.setHeader('X-Content-Type-Options', 'nosniff'); // Prevent MIME sniffing
    res.send(imageBuffer);
  } catch (error) {
    console.error('Error serving image:', error);
    res.status(500).json({ error: 'Failed to serve image' });
  }
});

// WebSocket-like endpoint for file change notifications
let changeClients = [];

app.get('/api/todo/watch', fileOperationLimiter, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  changeClients.push(res);

  req.on('close', () => {
    changeClients = changeClients.filter(client => client !== res);
  });
});

// Watch for file changes
const watcher = watch(TODO_FILE_PATH, {
  persistent: true,
  ignoreInitial: true,
});

watcher.on('change', () => {
  console.log('File changed, notifying clients...');
  changeClients.forEach(client => {
    client.write('data: {"type":"change"}\n\n');
  });
});

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
