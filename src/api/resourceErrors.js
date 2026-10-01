export class ConflictError extends Error {
  constructor(message, latest) {
    super(message);
    this.name = 'ConflictError';
    this.latest = latest;
  }
}

export class RateLimitError extends Error {
  constructor(message = 'Too many requests. Please wait and try again.') {
    super(message);
    this.name = 'RateLimitError';
  }
}

export class ResourceProtocolError extends Error {
  constructor(message, userMessage, details = {}) {
    super(message);
    this.name = 'ResourceProtocolError';
    this.userMessage = userMessage;
    this.details = details;
  }
}

export function resourceSaveUserMessage(resourceName, error) {
  if (error?.userMessage) return error.userMessage;
  if (error instanceof RateLimitError) {
    return `${error.message} Your edits are still here; try again when ready.`;
  }
  const technicalMessage = `${error?.message || ''} ${error?.payload?.error || ''}`;
  if (/backup/i.test(technicalMessage)) {
    return `Could not save ${resourceName} because its safety backup could not be created. Check available disk space and file permissions, then try again. Your edits are still here.`;
  }
  if (error instanceof TypeError || /network|fetch|offline|connection/i.test(technicalMessage)) {
    return `Could not save ${resourceName}. Check your connection and that the app server is running, then try again. Your edits are still here.`;
  }
  return `Could not save ${resourceName}. Your edits are still here. Try again, or restart the app server if the problem continues.`;
}

export async function readApiError(response, fallbackMessage) {
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    // The status-specific fallback below is still meaningful.
  }
  if (response.status === 409) {
    throw new ConflictError(payload.error || fallbackMessage, payload);
  }
  if (response.status === 429) {
    throw new RateLimitError(payload.error || payload.message);
  }
  if (response.status === 428) {
    throw new Error(payload.error || 'A base version is required before saving');
  }
  const error = new Error(payload.error || fallbackMessage);
  error.payload = payload;
  error.status = response.status;
  throw error;
}
