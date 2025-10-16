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

// Default file path - can be overridden via environment variable
const TODO_FILE_PATH = process.env.TODO_FILE_PATH || join(__dirname, 'todo.md');

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

// WebSocket-like endpoint for file change notifications
let changeClients = [];

app.get('/api/todo/watch', (req, res) => {
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
