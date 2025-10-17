# Migration to Single Server Architecture

## Overview

The todo-page application has been refactored from a two-server architecture (Vite dev server + Express backend) to a single integrated server architecture.

## What Changed

### Before (Two Servers)
- **Frontend**: Vite dev server on port 5173
- **Backend**: Express API server on port 3001
- **Setup**: Required two separate processes
- **LaunchAgents**: Two plist files (frontend + backend)
- **Access**: http://localhost:5173

### After (Single Server)
- **Integrated**: Express server with Vite middleware on port 3000
- **Setup**: Single process handles everything
- **LaunchAgents**: One plist file
- **Access**: http://localhost:3000

## Benefits

1. **Simpler Architecture**: One server instead of two
2. **No CORS Issues**: Frontend and API on same origin
3. **Easier Deployment**: Single process to manage
4. **Better Development Experience**: Same setup for dev and production
5. **Reduced Resource Usage**: Fewer processes running

## Functionality Preserved

✅ All existing features work identically:
- Task management (add, check, drag-drop)
- Live file watching and auto-refresh
- Markdown editor with auto-save
- Local image serving
- Multi-paragraph task support
- All keyboard shortcuts and accessibility features

## Migration Steps

### For Users Running via LaunchAgents

The migration has been completed automatically:

1. ✅ Old services stopped (frontend + backend)
2. ✅ New integrated service started
3. ✅ App now runs on http://localhost:3000

**Important**: Update your bookmarks from `http://localhost:5173` to `http://localhost:3000`

### For Manual Development

If you were running `npm run dev` manually:

**Before:**
```bash
npm run dev  # Started both servers via concurrently
```

**After:**
```bash
npm run dev  # Starts integrated server on port 3000
```

Access the app at http://localhost:3000 (instead of 5173)

## Technical Details

### Server Architecture (server.js)

The Express server now:
1. Registers all API routes first (`/api/*`)
2. In development: Adds Vite middleware for HMR
3. In production: Serves static files from `dist/`

### Frontend Changes (App.vue)

- Changed `API_BASE` from `'http://localhost:3001/api'` to `'/api'`
- Uses relative URLs - works on same origin
- Image serving URLs updated to relative paths

### Package.json Scripts

**Simplified scripts:**
- `npm run dev` - Start development server (was: start both servers)
- `npm run build` - Build for production (unchanged)
- `npm start` - Start production server (new)

### Dependencies

Moved to regular dependencies (needed for server.js imports):
- `vite`
- `@vitejs/plugin-vue`

Removed:
- `concurrently` (no longer needed)

## Cleanup (Optional)

The old LaunchAgent plist files are no longer used:
- `~/Library/LaunchAgents/com.user.todo-backend.plist`
- `~/Library/LaunchAgents/com.user.todo-frontend.plist`

You can safely remove them:
```bash
rm ~/Library/LaunchAgents/com.user.todo-backend.plist
rm ~/Library/LaunchAgents/com.user.todo-frontend.plist
```

## Verification

Check that everything is working:

1. **Service is running:**
   ```bash
   launchctl list | grep todo
   # Should show: com.user.todo-app
   ```

2. **Port is listening:**
   ```bash
   lsof -i :3000 | grep LISTEN
   # Should show node process
   ```

3. **Old ports are free:**
   ```bash
   lsof -i :3001 -i :5173
   # Should show nothing
   ```

4. **Access the app:**
   Open http://localhost:3000 in your browser

5. **Test features:**
   - Add a task
   - Check a task (moves to Done)
   - Edit in Markdown tab (auto-saves)
   - Edit todo.md externally (app refreshes)
   - Add an image (renders correctly)

## Troubleshooting

### App not accessible at localhost:3000

Check logs:
```bash
tail -f ~/git-repos/todo-page/logs/app.log
tail -f ~/git-repos/todo-page/logs/app.error.log
```

Restart service:
```bash
launchctl bootout gui/$(id -u)/com.user.todo-app
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.user.todo-app.plist
```

### Port 3000 already in use

Find what's using it:
```bash
lsof -i :3000
```

Kill the process or change the port in server.js:
```javascript
const PORT = process.env.PORT || 3000;  // Change 3000 to another port
```

### Vite HMR not working

The Vite middleware should provide hot module replacement automatically. If it's not working:
1. Check that NODE_ENV is not set to 'production'
2. Restart the service
3. Clear browser cache and reload

## Rollback (If Needed)

If you need to go back to the two-server setup:

```bash
# Stop new service
launchctl bootout gui/$(id -u)/com.user.todo-app

# Checkout previous version
git checkout main

# Start old services
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.user.todo-backend.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.user.todo-frontend.plist
```

Access app at http://localhost:5173
