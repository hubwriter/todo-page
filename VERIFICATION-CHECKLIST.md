# Single Server Refactoring - Verification Checklist

## ✅ Pre-Migration State Captured

- [x] Two servers running (Vite on 5173, Express on 3001)
- [x] All features documented and tested
- [x] LaunchAgents: com.user.todo-backend, com.user.todo-frontend

## ✅ Code Changes

- [x] server.js: Added Vite middleware integration
- [x] server.js: Added production static file serving
- [x] server.js: Changed port to 3000
- [x] src/App.vue: Changed API_BASE to relative URL '/api'
- [x] src/App.vue: Updated image URLs to relative paths
- [x] package.json: Simplified scripts
- [x] package.json: Moved Vite to dependencies
- [x] package.json: Removed concurrently

## ✅ LaunchAgent Configuration

- [x] Created new plist: com.user.todo-app.plist
- [x] Stopped old backend service
- [x] Stopped old frontend service
- [x] Started new integrated service
- [x] Verified service is running (PID: 60214)
- [x] Verified port 3000 is listening
- [x] Verified old ports (3001, 5173) are free

## ✅ Documentation

- [x] README.md updated with new architecture
- [x] README.md updated with auto-start instructions
- [x] IMPLEMENTATION.md updated with single-server info
- [x] MIGRATION.md created with full migration guide
- [x] REFACTORING-SUMMARY.md created
- [x] This checklist created

## ✅ Functionality Testing

- [x] API endpoint responds: http://localhost:3000/api/todo
- [x] Todo file reading works
- [x] Todo file path configuration works
- [x] App accessible at http://localhost:3000
- [x] Service auto-starts on login

## ✅ Features Verification (To Be Tested in Browser)

Test the following in http://localhost:3000:

### Basic Operations
- [ ] Page loads correctly
- [ ] Tasks display in all three lists
- [ ] Add new task works
- [ ] Task appears in Priority list

### Task Management
- [ ] Check task in Priority → moves to Done with date
- [ ] Check task in Other → moves to Done with date
- [ ] Drag and drop tasks in Priority
- [ ] Drag and drop tasks in Other
- [ ] Drag task from Done back to Priority (uncheck)

### Markdown Editor
- [ ] Switch to Markdown tab
- [ ] Content displays correctly
- [ ] Make edit in editor
- [ ] Changes auto-save after 1 second
- [ ] Switch back to Tasks tab
- [ ] Changes reflected in task lists

### External File Editing
- [ ] Open todo.md in external editor
- [ ] Make a change and save
- [ ] Web app refreshes automatically
- [ ] Changes reflected in browser

### Image Rendering
- [ ] Images in tasks render correctly
- [ ] HTML img tags work
- [ ] Markdown image syntax works
- [ ] Local file paths served via API

### Multi-paragraph Tasks
- [ ] Tasks with multiple paragraphs display correctly
- [ ] Indentation preserved
- [ ] Markdown rendering works in continuations

### Notes Tab
- [ ] Switch to Notes tab
- [ ] Project information displays

### Keyboard & Accessibility
- [ ] Cmd+Enter in task input submits
- [ ] Tab navigation works
- [ ] Checkboxes accessible via keyboard
- [ ] Screen reader labels present

## ✅ Performance Check

- [ ] Page loads quickly
- [ ] No console errors
- [ ] Vite HMR works (edit App.vue, auto-refresh)
- [ ] File watching responsive
- [ ] No memory leaks (check after extended use)

## ✅ Error Handling

- [ ] Check logs for errors: `tail -f ~/git-repos/todo-page/logs/app.log`
- [ ] Check error log: `tail -f ~/git-repos/todo-page/logs/app.error.log`
- [ ] API errors handled gracefully
- [ ] Invalid todo.md format handled

## ✅ Production Build (Optional Future Test)

- [ ] Run `npm run build`
- [ ] Build completes without errors
- [ ] dist/ directory created
- [ ] Run `NODE_ENV=production npm start`
- [ ] App works in production mode
- [ ] Static files served correctly

## ✅ Cleanup (Optional)

- [ ] Remove old LaunchAgent files
- [ ] Remove old log files (backend.log, frontend.log)
- [ ] Update browser bookmarks to port 3000

## ✅ Git Repository

- [ ] Review all changes: `git diff`
- [ ] Stage modified files: `git add .`
- [ ] Commit with message: "Refactor to single server architecture"
- [ ] Push to repository (if desired)

---

## Quick Test Command

```bash
# Open app in default browser
open http://localhost:3000

# Monitor logs in real-time
tail -f ~/git-repos/todo-page/logs/app.log

# Check service status
launchctl list | grep todo
lsof -i :3000
```

## Rollback Command (If Needed)

```bash
# Stop new service
launchctl bootout gui/$(id -u)/com.user.todo-app

# If you need the old setup, checkout main branch
git checkout main

# Start old services
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.user.todo-backend.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.user.todo-frontend.plist
```

---

**Current Status**: Infrastructure refactoring complete ✅
**Next Step**: Browser testing to verify all features work
**URL**: http://localhost:3000
