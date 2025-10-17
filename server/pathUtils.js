// Utility functions for path security validation
import { normalize, resolve } from 'path';
import { ALLOWED_PATH_PREFIXES, BLOCKED_DIRECTORY_PATTERNS } from '../src/constants.js';

/**
 * Validates and normalizes a file path for security
 * @param {string} filePath - The path to validate
 * @param {string} baseDir - Optional base directory to restrict to
 * @returns {Object} { isValid: boolean, normalizedPath: string, error: string }
 */
export function validatePath(filePath, baseDir = null) {
  try {
    // Normalize and resolve the path
    const normalizedPath = normalize(resolve(filePath));

    // Check for directory traversal attempts
    if (normalizedPath.includes('..') || filePath.includes('..')) {
      return {
        isValid: false,
        normalizedPath: null,
        error: 'Directory traversal not allowed'
      };
    }

    // If base directory specified, ensure path is within it
    if (baseDir) {
      const normalizedBase = normalize(resolve(baseDir));
      if (!normalizedPath.startsWith(normalizedBase)) {
        return {
          isValid: false,
          normalizedPath: null,
          error: 'Path outside allowed directory'
        };
      }
    }

    // Check if path starts with allowed prefix
    const hasAllowedPrefix = ALLOWED_PATH_PREFIXES.some(prefix =>
      normalizedPath.startsWith(prefix)
    );

    if (!hasAllowedPrefix) {
      return {
        isValid: false,
        normalizedPath: null,
        error: 'Invalid path location'
      };
    }

    // Check for blocked directory patterns
    const pathParts = normalizedPath.split('/').filter(Boolean);
    const hasBlockedPattern = pathParts.some(part =>
      part.startsWith('.') || BLOCKED_DIRECTORY_PATTERNS.includes(part)
    );

    if (hasBlockedPattern) {
      return {
        isValid: false,
        normalizedPath: null,
        error: 'Access to sensitive directory denied'
      };
    }

    return {
      isValid: true,
      normalizedPath,
      error: null
    };
  } catch (error) {
    return {
      isValid: false,
      normalizedPath: null,
      error: error.message
    };
  }
}

/**
 * Validates file extension against allowed list
 * @param {string} filePath - Path to check
 * @param {string[]} allowedExtensions - Array of allowed extensions
 * @returns {Object} { isValid: boolean, extension: string }
 */
export function validateFileExtension(filePath, allowedExtensions) {
  const ext = filePath.toLowerCase().split('.').pop();
  return {
    isValid: allowedExtensions.includes(ext),
    extension: ext
  };
}
