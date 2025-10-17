// Application-wide constants

// API Configuration
export const API_BASE = '/api';

// Content Limits (in bytes)
export const MAX_BODY_SIZE = 1 * 1024 * 1024; // 1MB
export const MAX_TODO_SIZE = 5 * 1024 * 1024; // 5MB
export const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB

// Rate Limiting
export const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
export const RATE_LIMIT_MAX_REQUESTS = 60;

// Image Configuration
export const ALLOWED_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'];

export const IMAGE_CONTENT_TYPES = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  ico: 'image/x-icon'
};

// Path Security
export const ALLOWED_PATH_PREFIXES = ['/Users/', '/home/'];
export const BLOCKED_DIRECTORY_PATTERNS = ['.ssh', '.aws', '.config', 'node_modules', '.git', '.env'];

// UI Timing (client-side only)
export const AUTO_SAVE_DELAY_MS = 1000;
export const SCROLL_DELAY_MS = 100;
export const HIGHLIGHT_DURATION_MS = 1500;
export const FOCUS_DELAY_MS = 100;
export const RECONNECT_DELAY_MS = 5000;

// DOMPurify Configuration (client-side only)
export const SANITIZE_CONFIG = {
  ALLOWED_TAGS: ['a', 'img', 'strong', 'em', 'code', 'del', 'br'],
  ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'target', 'rel', 'width', 'height', 'style', 'class', 'id'],
  ALLOW_DATA_ATTR: false
};

// Default TODO file content
export const DEFAULT_TODO_CONTENT = `# Priority

# Other

# Done
`;
