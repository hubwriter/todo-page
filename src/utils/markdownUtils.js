// Markdown parsing utilities
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { SANITIZE_CONFIG } from '../constants.js';

/**
 * Transform local file paths to API URLs in markdown/HTML
 * @param {string} text - Text containing potential image paths
 * @returns {string} Transformed text
 */
export function transformImagePaths(text) {
  if (!text) return text;

  let result = text;

  // Replace file:// URLs in img tags
  result = result.replace(
    /<img\s+([^>]*?)src=["']file:\/\/([^"']+)["']([^>]*?)>/gi,
    (match, before, path, after) => {
      const encodedPath = encodeURIComponent(path);
      return `<img ${before}src="/api/image?path=${encodedPath}"${after}>`;
    }
  );

  // Replace absolute paths in img tags (starting with /)
  result = result.replace(
    /<img\s+([^>]*?)src=["'](\/.+?)["']([^>]*?)>/gi,
    (match, before, path, after) => {
      const encodedPath = encodeURIComponent(path);
      return `<img ${before}src="/api/image?path=${encodedPath}"${after}>`;
    }
  );

  // Replace markdown image syntax with local paths
  result = result.replace(
    /!\[([^\]]*)\]\((\/.+?)\)/g,
    (match, alt, path) => {
      const encodedPath = encodeURIComponent(path);
      return `![${alt}](/api/image?path=${encodedPath})`;
    }
  );

  return result;
}

/**
 * Render markdown to HTML with sanitization
 * @param {string} text - Markdown text to render
 * @param {Object} options - Use inline: false to render block Markdown
 * @returns {string} Sanitized HTML
 */
export function renderMarkdown(text, { inline = true } = {}) {
  if (!text) return '';

  // Transform local image paths to API URLs first
  const transformed = transformImagePaths(text);

  const options = { async: false, gfm: true, breaks: true };
  const rawHtml = inline
    ? marked.parseInline(transformed, options)
    : marked.parse(transformed, options);

  // Sanitize the output to prevent XSS attacks
  return DOMPurify.sanitize(rawHtml, inline ? SANITIZE_CONFIG : {
    ...SANITIZE_CONFIG,
    ALLOWED_TAGS: [
      ...SANITIZE_CONFIG.ALLOWED_TAGS,
      'p', 'ul', 'ol', 'li', 'blockquote', 'pre', 'hr',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'table', 'thead', 'tbody', 'tr', 'th', 'td'
    ],
    ALLOWED_ATTR: [...SANITIZE_CONFIG.ALLOWED_ATTR, 'start', 'align']
  });
}

/**
 * Parse markdown content into task sections
 * @param {string} content - Raw markdown content
 * @returns {Object} { priority: [], other: [], done: [] }
 */
export function parseMarkdownToTasks(content) {
  const lines = content.split(/\r?\n/);
  let currentSection = null;
  const sections = {
    priority: [],
    other: [],
    done: []
  };
  let currentTask = null;

  function finishTask() {
    if (currentTask !== null && currentSection) {
      // Blank lines between entries/sections are not part of the task.
      while (currentTask.length && !currentTask.at(-1).trim()) currentTask.pop();
      sections[currentSection].push(currentTask.join('\n'));
    }
    currentTask = null;
  }

  for (const line of lines) {
    const heading = /^# (Priority|Other|Done)\s*$/.exec(line);
    const task = /^- \[[ xX]\](?:[ \t]+(.*)|$)/.exec(line);

    if (heading) {
      finishTask();
      currentSection = heading[1].toLowerCase();
    } else if (task) {
      finishTask();
      const taskText = (task[1] || '').trim();
      if (taskText && currentSection) {
        currentTask = [taskText];
      }
    } else if (currentTask !== null) {
      // Remove only the storage prefix, preserving Markdown indentation.
      currentTask.push(line.startsWith('  ') ? line.slice(2) : line);
    }
  }
  finishTask();

  return sections;
}

/**
 * Generate markdown from task arrays
 * @param {Array} priorityTasks - Priority task list
 * @param {Array} otherTasks - Other task list
 * @param {Array} doneTasks - Done task list
 * @returns {string} Markdown content
 */
export function generateMarkdownFromTasks(priorityTasks, otherTasks, doneTasks) {
  const sections = [
    { header: '# Priority', tasks: priorityTasks, checkbox: '- [ ]' },
    { header: '# Other', tasks: otherTasks, checkbox: '- [ ]' },
    { header: '# Done', tasks: doneTasks, checkbox: '- [x]' }
  ];

  return sections.map(({ header, tasks, checkbox }) => {
    let content = `${header}\n\n`;
    for (const task of tasks) {
      const lines = task.split('\n');
      content += `${checkbox} ${lines[0]}\n`;
      // Add continuation lines with indentation
      for (let i = 1; i < lines.length; i++) {
        content += `  ${lines[i]}\n`;
      }
    }
    return content;
  }).join('\n');
}

/**
 * Format task for completion (adds date prefix)
 * @param {string} task - Task text
 * @returns {string} Task with date prefix
 */
export function addDateToTask(task) {
  const today = new Date().toISOString().split('T')[0];
  return `${today} - ${task}`;
}

/**
 * Remove date prefix from completed task
 * @param {string} task - Task with date prefix
 * @returns {string} Task without date prefix
 */
export function removeDateFromTask(task) {
  return task.replace(/^\d{4}-\d{2}-\d{2}\s*-\s*/, '');
}
