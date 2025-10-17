# Implementation Guide

## Architecture

The application uses a **single integrated server** architecture:
- Express.js serves both the API endpoints and the frontend
- In development: Vite middleware provides hot module replacement (HMR)
- In production: Express serves pre-built static files from `dist/`
- Single port (3000) for all traffic - no CORS issues

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Run the application:**
   ```bash
   npm run dev
   ```

3. **Access the app:**
   - Application: http://localhost:3000
   - API endpoints available at: http://localhost:3000/api/*

## Configuration

### Custom File Path

To use a specific markdown file (e.g., `/Users/alistair/work-stuff/tech-writing/todo.md`):

```bash
TODO_FILE_PATH="/Users/alistair/work-stuff/tech-writing/todo.md" npm run dev
```

Or set it as an environment variable in your shell:

```bash
export TODO_FILE_PATH="/Users/alistair/work-stuff/tech-writing/todo.md"
npm run dev
```

## Markdown File Format

The application expects this structure:

```markdown
# Priority

- [ ] First priority task
- [ ] Second priority task

# Other

- [ ] Task that's not urgent
- [ ] Another task

# Done

- [x] 2025-10-16 - Completed task
- [x] 2025-10-15 - Another completed task
```

## Features

### Task Management

#### Adding Tasks
- Input field at the top accepts text with markdown formatting
- Keyboard shortcut: Cmd+Enter (Mac) or Ctrl+Enter (Windows/Linux) to submit
- Tasks are added to the top of the Priority list
- Automatic save on submission

#### Context Menu
- Double-click any task to open a context menu
- Available actions vary by list type:
  - **Priority/Other**: Edit, Move to "Other"/"Priority", Delete
  - **Done**: Delete only
- Menu dismissal: Click outside menu area or press ESC key
- Full-viewport backdrop ensures clicks anywhere dismiss the menu

#### Task Editing
- Edit action populates input field with task content
- Original position and list are tracked during editing
- Save action returns task to its original location with visual feedback
- Cancel action restores unchanged task to original position
- Visual indicators: Button text changes to "Save", placeholder updates
- Buttons are disabled when input field is empty

#### Task Movement
- Move actions transfer tasks to top of target list
- Automatic smooth scrolling to new location
- Visual feedback: 1.5-second yellow highlight on moved/edited tasks
- Checkbox on "Other" tasks moves them to "Priority" (legacy behavior)

#### Completing Tasks
- Check the checkbox next to any task in Priority or Other
- Task moves to the top of Done with current date stamp
- Date format: YYYY-MM-DD

#### Reordering Tasks
- Drag and drop interface within Priority and Other lists
- Real-time position updates
- Changes are immediately persisted to markdown file

#### Markdown Editor
- Dedicated tab for direct markdown editing
- Auto-save with 1-second debounce after typing stops
- Changes propagate to task list view
- Supports full markdown syntax including links and multi-line content

#### External File Synchronization
- Chokidar file watcher monitors markdown file
- Server-Sent Events (SSE) push updates to client
- Automatic UI refresh on external file modifications
- Bi-directional sync: changes in app or external editor are reflected immediately

## Technical Architecture

### Single Server Design
The application employs a unified server architecture:
- Single Express.js server handles all requests on port 3000
- Development mode: Vite middleware integrated for HMR
- Production mode: Express serves pre-built static assets
- Eliminates CORS complexity and port management overhead

### Frontend (Vue 3)
- **Composition API**: Reactive state management using `ref` and reactive objects
- **App.vue**: Main component (1100+ lines) containing:
  - Task list rendering with drag-and-drop
  - Context menu system with backdrop overlay
  - Position-aware editing state machine
  - Markdown editor with auto-save
  - Real-time file synchronization handlers
- **main.js**: Application entry point and Vue initialization
- **style.css**: Global styles and component-scoped styles

### State Management
Core reactive state objects:
- `contextMenu`: Menu visibility, position, and selected task
- `editingTask`: Tracks editing mode, original list, and original index
- `priorityTasks`, `otherTasks`, `doneTasks`: Task arrays for each list
- `markdownContent`: Raw markdown content for editor tab

### Backend (Express.js)
**server.js** provides three API endpoints:
- `GET /api/todo` - Retrieve markdown file contents
- `POST /api/todo` - Persist markdown changes to file
- `GET /api/todo/watch` - Server-Sent Events stream for file changes

**Middleware stack**:
- Rate limiting: 60 requests per minute per IP
- JSON body parser for POST requests
- Vite middleware (development only) for HMR
- Static file serving (production only)

### File Watching System
- **Chokidar**: Monitors markdown file for external modifications
- **Server-Sent Events (SSE)**: Push-based notifications to client
- **Debouncing**: 100ms delay prevents rapid successive updates
- **Automatic sync**: Frontend reloads task list on file change events

### User Interface Components

#### Context Menu
- Fixed-position overlay with z-index layering
- Transparent backdrop (z-index: 999) captures outside clicks
- Menu positioned at cursor coordinates (z-index: 1000)
- Conditional rendering based on task list type
- Keyboard event listener for ESC key dismissal

#### Task List Rendering
- Markdown rendering via Marked.js library
- Multi-line task support with proper indentation
- Drag-and-drop via HTML5 Drag and Drop API
- Checkbox state handling with conditional logic per list

#### Visual Feedback System
- Smooth scroll behavior using `scrollIntoView()`
- Temporary highlighting: 1.5-second yellow background (#fff3cd)
- 100ms setTimeout ensures DOM updates complete before scroll
- Button state changes during editing mode

## Development

### Building for Production
```bash
npm run build
```

Output is in the `dist/` directory.

### Running Production Build
```bash
npm run preview
```

## Troubleshooting

### Port Already in Use
If port 3000 is already in use, modify the `PORT` constant in `server.js`:

```javascript
const PORT = 3001; // Change from 3000
```

Note: The application now uses a single port (3000 by default) instead of the previous dual-server setup (3001 + 5173).

### File Not Found
The application creates a default markdown file if none exists at the specified path. Verify:
- File path configuration is correct (config.json or TODO_FILE_PATH)
- Server process has appropriate read/write permissions
- Parent directory exists

### External Changes Not Syncing
If file watching appears non-functional:
- Verify the file path matches the configured location
- Check that no other process has locked the file
- Ensure file system events are supported (some network drives may not support watching)
- Review server logs for Chokidar errors

### Context Menu Not Dismissing
The context menu should dismiss on:
- Click anywhere outside the menu (including page margins)
- ESC key press

If issues persist, verify that JavaScript is enabled and no browser extensions interfere with event handling.

## Testing

Comprehensive testing has validated:
- **Task operations**: Add, edit, delete, move, complete, reorder
- **Context menu**: Display, positioning, action execution, dismissal
- **Position memory**: Tasks return to original location after editing
- **Visual feedback**: Scrolling, highlighting, button states
- **Keyboard shortcuts**: Cmd+Enter submit, ESC dismissal
- **Markdown rendering**: Links, formatting, multi-line content
- **Drag-and-drop**: Reordering within lists
- **File synchronization**: External edits, auto-save, live updates
- **Editor functionality**: Direct markdown editing, auto-save debounce
- **Security**: Rate limiting, input sanitization (via Marked.js configuration)
- **Accessibility**: Keyboard navigation, ARIA labels, disabled states

All functionality operates as specified.
