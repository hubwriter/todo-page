import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import { watch } from 'chokidar';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import rateLimit from 'express-rate-limit';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());

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
    const configPath = join(__dirname, 'config.json');
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
  if (process.env.TODO_FILE_PATH) {
    return process.env.TODO_FILE_PATH;
  }

  if (config.todoFilePath) {
    return config.todoFilePath;
  }

  return join(__dirname, 'todo.md');
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
    if (typeof content !== 'string') {
      return res.status(400).json({ error: 'Content must be a string' });
    }
    await fs.writeFile(TODO_FILE_PATH, content, 'utf-8');
    res.json({ success: true });
  } catch (error) {
    console.error('Error writing file:', error);
    res.status(500).json({ error: 'Failed to write todo file' });
  }
});

// Serve local image files
app.get('/api/image', async (req, res) => {
  try {
    const { path } = req.query;

    if (!path) {
      return res.status(400).json({ error: 'Image path is required' });
    }

    // Security: Only allow absolute paths starting with /Users/ (macOS)
    // Adjust this based on your security requirements
    if (!path.startsWith('/Users/')) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Check if file exists and is readable
    try {
      await fs.access(path, fs.constants.R_OK);
    } catch {
      return res.status(404).json({ error: 'Image not found' });
    }

    // Read and serve the file
    const imageBuffer = await fs.readFile(path);

    // Determine content type based on file extension
    const ext = path.toLowerCase().split('.').pop();
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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  ensureFileExists();
});
