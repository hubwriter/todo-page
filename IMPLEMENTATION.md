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

### Adding Tasks
- Type in the input field at the top
- Press Enter or click "Add"
- Task appears at the top of Priority

### Completing Tasks
- Check the checkbox next to any task in Priority or Other
- Task moves to the top of Done with today's date

### Moving to Priority
- Check the checkbox next to any task in Other
- Task moves to the top of Priority (without a date)

### Reordering Tasks
- Drag and drop tasks within Priority or Other lists
- Changes are automatically saved

### Editing Markdown
- Use the Markdown Editor at the bottom
- Click "Save Markdown" or tab away to save changes
- The UI updates to reflect your edits

### External Edits
- Edit the markdown file in any text editor
- Save the file
- The web app automatically detects and loads the changes

## Architecture

### Frontend (Vue 3)
- **App.vue**: Main component with task lists and markdown editor
- **main.js**: Application entry point
- **style.css**: Global styles

### Backend (Express.js)
- **server.js**: Express server with three endpoints:
  - `GET /api/todo` - Read markdown file
  - `POST /api/todo` - Write markdown file
  - `GET /api/todo/watch` - Server-Sent Events for file changes

### Security
- Rate limiting: 60 requests per minute per IP address
- Applies to all endpoints including SSE

### File Watching
- Chokidar monitors the markdown file for changes
- Server-Sent Events notify the frontend of updates
- Frontend automatically reloads when file changes

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
If port 3001 or 5173 is already in use, you can change them:

**Backend (server.js):**
Change the `PORT` constant:
```javascript
const PORT = 3002; // Change from 3001
```

**Frontend (vite.config.js):**
Add server configuration:
```javascript
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5174 // Change from default 5173
  }
})
```

### File Not Found
Ensure the markdown file exists at the specified path. The app will create a default file if it doesn't exist.

### External Changes Not Syncing
Check that the file path is correct and the server has read/write permissions.

## Testing

The application has been tested with:
- Adding tasks to Priority
- Completing tasks (moving to Done with dates)
- Moving tasks from Other to Priority
- Drag-and-drop reordering
- Markdown editor updates
- External file change detection
- Security scanning (CodeQL)

All core functionality works as expected.
