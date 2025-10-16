# Markdown-Driven To-Do List Web App

A Vue 3 + Vite web application for managing to-do lists with markdown file synchronization. Edit tasks in the browser or directly in the markdown file - changes are reflected instantly in both places.

## Features

- ✅ **Markdown File Integration**: Read and write tasks from/to a markdown file
- ✅ **Three Task Categories**: Priority, Other, and Done
- ✅ **Add Tasks**: Quick input to add tasks to Priority list
- ✅ **Drag and Drop**: Reorder tasks in Priority and Other lists
- ✅ **Complete Tasks**: Check items to move them to Done with date stamps
- ✅ **Move to Priority**: Uncheck items in Other to move them to Priority
- ✅ **Live Sync**: External changes to the markdown file are automatically reflected in the app
- ✅ **Markdown Editor**: Built-in editor to directly edit the markdown content
- ✅ **Accessible**: Keyboard navigation and screen reader support
- ✅ **Responsive**: Works on desktop and mobile devices

## Getting Started

### Prerequisites

- Node.js 16+ installed
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone https://github.com/hubwriter/todo-page.git
cd todo-page
```

2. Install dependencies:
```bash
npm install
```

### Configuration

By default, the app uses a `todo.md` file in the project root. To use a custom file path:

```bash
export TODO_FILE_PATH="/Users/alistair/work-stuff/tech-writing/todo.md"
```

Or set it directly when running:
```bash
TODO_FILE_PATH="/Users/alistair/work-stuff/tech-writing/todo.md" npm run dev
```

### Running the App

Start the development server:
```bash
npm run dev
```

This starts:
- Backend server on http://localhost:3001
- Vite dev server on http://localhost:5173

Open http://localhost:5173 in your browser.

### Building for Production

```bash
npm run build
```

The built files will be in the `dist` directory.

## Usage

### Adding Tasks

1. Type a task in the input field at the top
2. Click "Add" or press Enter
3. The task appears at the top of the Priority list
4. Changes are automatically saved to the markdown file

### Reordering Tasks

1. Drag a task from Priority or Other
2. Drop it at the desired position
3. Changes are automatically saved

### Completing Tasks

1. Check the checkbox next to a task in Priority or Other
2. The task moves to the top of Done with today's date
3. Changes are automatically saved

### Moving Tasks to Priority

1. Check the checkbox next to a task in Other
2. The task moves to the top of Priority (without a date)
3. Changes are automatically saved

### Editing Markdown Directly

1. Use the Markdown Editor section at the bottom
2. Make your changes
3. Click "Save Markdown" or tab away from the editor
4. The task lists update to reflect your changes

### External Edits

1. Open the markdown file in any text editor
2. Make changes and save
3. The web app automatically refreshes to show your changes

## Markdown Format

The markdown file follows this structure:

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

## Technical Stack

- **Frontend**: Vue 3 with Composition API
- **Build Tool**: Vite
- **Backend**: Express.js
- **File Watching**: Chokidar
- **Real-time Updates**: Server-Sent Events (SSE)

## Project Structure

```
todo-page/
├── src/
│   ├── App.vue          # Main application component
│   ├── main.js          # Application entry point
│   └── style.css        # Global styles
├── server.js            # Express backend for file operations
├── index.html           # HTML template
├── vite.config.js       # Vite configuration
└── package.json         # Dependencies and scripts
```

## License

See LICENSE file for details.