import { ref } from 'vue';
import {
  ConflictError,
  RateLimitError,
  ResourceProtocolError,
  resourceSaveUserMessage
} from '../api/resourceErrors.js';
import { closeConflictDialog, queueConflictDialog } from './useConflictDialogQueue.js';
import {
  safeStorageGet,
  safeStorageKeys,
  safeStorageRemove,
  safeStorageSet
} from '../utils/safeSessionStorage.js';

const DRAFT_PREFIX = 'todo-page-conflict:';
let unloadInstalled = false;

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function installUnloadWarning() {
  if (unloadInstalled || typeof window === 'undefined') return;
  unloadInstalled = true;
  window.addEventListener('beforeunload', (event) => {
    const hasDraft = safeStorageKeys().some((key) => key.startsWith(DRAFT_PREFIX));
    if (!hasDraft) return;
    event.preventDefault();
    event.returnValue = '';
  });
}

export function useConflictAwareSave({
  resource,
  loadRemote,
  saveRemote,
  merge,
  snapshotFromResponse,
  versionFromResponse = (response) => response.version,
  validate = () => ({ valid: true }),
  onCandidate = () => {},
  onAccepted = () => {},
  retryLimit = 3,
  rateLimitRetryDelays = [250, 750]
}) {
  installUnloadWarning();
  const baseSnapshot = ref(null);
  const version = ref('');
  const localCandidate = ref(null);
  const dirty = ref(false);
  const resolving = ref(false);
  const externalChange = ref(false);
  const unresolved = ref(false);
  const contention = ref('');
  const error = ref('');
  const recoveryWarning = ref('');
  const preserveCandidateOnFailure = ref(false);
  const inFlight = ref(false);
  const pendingOperations = ref(0);
  const draftKey = `${DRAFT_PREFIX}${resource}`;
  let activeMerge = null;
  let conflictOrigin = null;
  let savedConflicts = [];
  let resolvedUnsaved = false;
  let resolvedSaveOptions = {};
  let candidateRevision = 0;
  let saveQueue = Promise.resolve();
  const resourceName = resource === 'todo' ? 'Tasks and Markdown' : 'Links';
  let focusReturnTarget = null;

  function noteStorageFailure(message, failure) {
    recoveryWarning.value = message;
    console.warn(`Could not access ${resource} recovery storage:`, failure);
  }

  function clearFocusReturnTarget() {
    focusReturnTarget = null;
  }

  function responseState(response, operation) {
    const snapshot = clone(snapshotFromResponse(response));
    const responseVersion = versionFromResponse(response);
    if (snapshot === undefined || snapshot === null || typeof responseVersion !== 'string' || !responseVersion) {
      throw new ResourceProtocolError(
        `Invalid ${resource} ${operation} response: snapshot=${snapshot === null ? 'null' : typeof snapshot}, version=${typeof responseVersion}`,
        `The ${resourceName.toLowerCase()} server returned an outdated response. Restart the app server, then try again. Your edits are still here.`,
        {
          resource,
          operation,
          snapshotType: snapshot === null ? 'null' : typeof snapshot,
          versionType: typeof responseVersion,
          responseKeys: response && typeof response === 'object' ? Object.keys(response) : []
        }
      );
    }
    return { snapshot, responseVersion };
  }

  async function runRemoteSave(candidate, baseVersion, options) {
    inFlight.value = true;
    try {
      return await saveRemote(candidate, baseVersion, options);
    } finally {
      inFlight.value = false;
    }
  }

  function persistDraft(conflicts = [], dialogState = {}) {
    if (!dirty.value && !resolving.value) {
      safeStorageRemove(draftKey, noteStorageFailure);
      return;
    }
    const draftState = resolvedUnsaved
      ? 'resolved'
      : (resolving.value || unresolved.value ? 'conflicts' : 'dirty');
    safeStorageSet(draftKey, JSON.stringify({
      resource,
      state: draftState,
      baseSnapshot: baseSnapshot.value,
      baseVersion: version.value,
      candidate: localCandidate.value,
      conflictOrigin: draftState === 'conflicts' ? conflictOrigin : null,
      saveOptions: draftState === 'resolved' ? resolvedSaveOptions : {},
      currentIndex: dialogState.currentIndex ?? 0,
      replacementConfirmed: dialogState.replacementConfirmed === true,
      conflicts: draftState === 'conflicts'
        ? conflicts.map(({ id, label, resolution, resolved }) => ({
          id, label, resolution, resolved
        }))
        : []
    }), noteStorageFailure);
  }

  function setResolvedCandidate(candidate, options = {}) {
    localCandidate.value = clone(candidate);
    candidateRevision++;
    onCandidate(clone(localCandidate.value));
    preserveCandidateOnFailure.value = true;
    dirty.value = true;
    resolving.value = false;
    unresolved.value = false;
    resolvedUnsaved = true;
    resolvedSaveOptions = clone(options) || {};
    activeMerge = null;
    conflictOrigin = null;
    savedConflicts = [];
    persistDraft();
  }

  function adopt(response) {
    const { snapshot, responseVersion } = responseState(response, 'accepted save');
    baseSnapshot.value = snapshot;
    localCandidate.value = clone(snapshot);
    version.value = responseVersion;
    dirty.value = false;
    resolving.value = false;
    unresolved.value = false;
    externalChange.value = false;
    contention.value = '';
    error.value = '';
    preserveCandidateOnFailure.value = false;
    activeMerge = null;
    conflictOrigin = null;
    savedConflicts = [];
    resolvedUnsaved = false;
    resolvedSaveOptions = {};
    closeConflictDialog(resource);
    clearFocusReturnTarget();
    safeStorageRemove(draftKey, noteStorageFailure);
    return snapshot;
  }

  function markDirty(candidate) {
    localCandidate.value = clone(candidate);
    candidateRevision++;
    dirty.value = true;
    preserveCandidateOnFailure.value = false;
    if (!resolvedUnsaved) resolvedSaveOptions = {};
    persistDraft();
  }

  function restoreCandidate(candidate, wasDirty = false) {
    localCandidate.value = clone(candidate);
    candidateRevision++;
    dirty.value = wasDirty;
    preserveCandidateOnFailure.value = false;
    resolvedUnsaved = false;
    resolvedSaveOptions = {};
    persistDraft();
  }

  function openConflicts(mergeResult, priorConflicts = [], priorDialogState = {}) {
    activeMerge = mergeResult;
    const restored = mergeResult.conflicts.map((conflict) => {
      const saved = priorConflicts.find((item) => item.id === conflict.id && item.label === conflict.label);
      return saved ? { ...conflict, resolution: saved.resolution, resolved: saved.resolved } : conflict;
    });
    savedConflicts = restored.map((item) => ({ ...item }));
    resolving.value = true;
    unresolved.value = true;
    const workflow = {
      resource,
      resourceName,
      focusReturnTarget,
      conflicts: restored.map((item) => ({ ...item })),
      currentIndex: Math.min(priorDialogState.currentIndex ?? 0, Math.max(restored.length - 1, 0)),
      replacementConfirmed: priorDialogState.replacementConfirmed === true,
      validate(resolutions) {
        return validate(mergeResult.assemble(resolutions));
      },
      requiresReplacementConfirmation: mergeResult.requiresReplacementConfirmation === true,
      replacementConfirmationLabel: mergeResult.replacementConfirmationLabel,
      updateDraft(resolutions, dialogState) {
        savedConflicts = resolutions.map((item) => ({ ...item }));
        workflow.conflicts = savedConflicts.map((item) => ({ ...item }));
        workflow.currentIndex = dialogState.currentIndex;
        workflow.replacementConfirmed = dialogState.replacementConfirmed === true;
        persistDraft(savedConflicts, dialogState);
      },
      async apply(resolutions, { replacementConfirmed = false } = {}) {
        if (mergeResult.requiresReplacementConfirmation && !replacementConfirmed) {
          error.value = 'Confirm that you want to replace the invalid links file.';
          return null;
        }
        setResolvedCandidate(
          mergeResult.assemble(resolutions),
          mergeResult.saveOptions || {}
        );
        return enqueueSave(resolvedSaveOptions);
      },
      cancel(resolutions) {
        savedConflicts = resolutions.map((item) => ({ ...item }));
        resolving.value = false;
        unresolved.value = true;
        persistDraft(resolutions);
        closeConflictDialog(resource);
        clearFocusReturnTarget();
      }
    };
    persistDraft(restored, workflow);
    queueConflictDialog(workflow);
    focusReturnTarget = workflow.focusReturnTarget;
  }

  async function handleConflict(latest, attempt, options) {
    const previousBase = clone(baseSnapshot.value);
    const { snapshot: latestSnapshot, responseVersion } = responseState(latest, 'conflict');
    const mergeResult = merge(baseSnapshot.value, localCandidate.value, latestSnapshot);
    baseSnapshot.value = latestSnapshot;
    version.value = responseVersion;
    externalChange.value = true;

    if (mergeResult.conflicts.length === 0) {
      const retryOptions = mergeResult.saveOptions || options;
      setResolvedCandidate(mergeResult.content ?? mergeResult.categories, retryOptions);
      if (attempt >= retryLimit) {
        contention.value = 'Changes keep arriving. Please wait a moment and save again.';
        unresolved.value = true;
        closeConflictDialog(resource);
        clearFocusReturnTarget();
        return null;
      }
      return attemptSave(attempt + 1, retryOptions);
    }

    resolvedUnsaved = false;
    resolvedSaveOptions = {};
    conflictOrigin = previousBase;
    openConflicts(mergeResult);
    return null;
  }

  function resumeUnresolvedMerge() {
    if (!unresolved.value || conflictOrigin === null) return false;
    const mergeResult = merge(conflictOrigin, localCandidate.value, baseSnapshot.value);
    if (mergeResult.conflicts.length) {
      openConflicts(mergeResult, savedConflicts);
      return true;
    }

    localCandidate.value = clone(mergeResult.content ?? mergeResult.categories);
    candidateRevision++;
    preserveCandidateOnFailure.value = true;
    unresolved.value = false;
    resolvedUnsaved = true;
    resolvedSaveOptions = clone(mergeResult.saveOptions) || {};
    activeMerge = null;
    conflictOrigin = null;
    savedConflicts = [];
    persistDraft();
    return false;
  }

  function adoptAcceptedResponse(response, attemptedCandidate, attemptedRevision) {
    if (candidateRevision === attemptedRevision) {
      const accepted = adopt(response);
      onAccepted(clone(accepted), {
        response,
        version: version.value
      });
      return accepted;
    }

    const { snapshot: acceptedSnapshot, responseVersion } = responseState(response, 'accepted save');
    const mergeResult = merge(attemptedCandidate, localCandidate.value, acceptedSnapshot);
    baseSnapshot.value = acceptedSnapshot;
    version.value = responseVersion;
    dirty.value = true;
    externalChange.value = false;
    contention.value = '';
    error.value = '';
    preserveCandidateOnFailure.value = true;

    if (mergeResult.conflicts.length) {
      resolvedUnsaved = false;
      resolvedSaveOptions = {};
      conflictOrigin = clone(attemptedCandidate);
      openConflicts(mergeResult);
      return clone(localCandidate.value);
    }

    localCandidate.value = clone(mergeResult.content ?? mergeResult.categories);
    candidateRevision++;
    onCandidate(clone(localCandidate.value));
    resolving.value = false;
    unresolved.value = false;
    activeMerge = null;
    conflictOrigin = null;
    savedConflicts = [];
    resolvedUnsaved = false;
    resolvedSaveOptions = {};
    persistDraft();
    return clone(localCandidate.value);
  }

  async function attemptSave(attempt = 0, options = {}, rateLimitAttempt = 0) {
    const attemptedCandidate = clone(localCandidate.value);
    const attemptedRevision = candidateRevision;
    const attemptedVersion = version.value;
    const validation = validate(attemptedCandidate);
    if (!validation.valid) {
      error.value = validation.error;
      unresolved.value = true;
      persistDraft();
      const validationError = new Error(validation.error);
      validationError.userMessage = validation.error;
      throw validationError;
    }
    try {
      error.value = '';
      const response = await runRemoteSave(attemptedCandidate, attemptedVersion, options);
      return adoptAcceptedResponse(response, attemptedCandidate, attemptedRevision);
    } catch (saveError) {
      if (saveError instanceof ConflictError) {
        return handleConflict(saveError.latest, attempt, options);
      }
      console.error(`Error saving ${resource}:`, saveError);
      if (saveError instanceof RateLimitError) {
        if (rateLimitAttempt < rateLimitRetryDelays.length) {
          error.value = `${saveError.message} Retrying; your edits are still here.`;
          await new Promise((resolve) => setTimeout(resolve, rateLimitRetryDelays[rateLimitAttempt]));
          return attemptSave(attempt, options, rateLimitAttempt + 1);
        }
        error.value = `${saveError.message} Your edits are still here; save again when ready.`;
      } else {
        error.value = resourceSaveUserMessage(resourceName, saveError);
      }
      if (!saveError.userMessage) saveError.userMessage = error.value;
      if (candidateRevision !== attemptedRevision) {
        preserveCandidateOnFailure.value = true;
      }
      persistDraft();
      throw saveError;
    }
  }

  function enqueueOperation(operation) {
    pendingOperations.value++;
    const pending = saveQueue.then(operation, operation);
    saveQueue = pending
      .catch(() => {})
      .finally(() => {
        pendingOperations.value--;
      });
    return pending;
  }

  function enqueueSave(options = {}) {
    return enqueueOperation(() => attemptSave(0, options));
  }

  async function save(candidate, options = {}) {
    if (resolvedUnsaved) {
      localCandidate.value = clone(candidate);
      candidateRevision++;
      dirty.value = true;
      if (Object.keys(options).length) resolvedSaveOptions = clone(options);
      persistDraft();
      return enqueueSave(resolvedSaveOptions);
    }
    markDirty(candidate);
    if (resumeUnresolvedMerge()) return null;
    return enqueueSave(options);
  }

  function initialize(response) {
    const { snapshot: latestSnapshot, responseVersion: latestVersion } = responseState(response, 'load');
    const stored = safeStorageGet(draftKey, noteStorageFailure);
    if (!stored) return adopt(response);

    try {
      const draft = JSON.parse(stored);
      baseSnapshot.value = clone(draft.baseSnapshot);
      version.value = draft.baseVersion;
      localCandidate.value = clone(draft.candidate);
      candidateRevision++;
      dirty.value = true;
      const restoredResolved = draft.state === 'resolved'
        || (
          draft.state === undefined
          && draft.conflictOrigin === null
          && draft.conflicts?.length > 0
          && draft.conflicts.every((conflict) => conflict.resolved)
        );
      if (restoredResolved) {
        resolving.value = false;
        unresolved.value = false;
        resolvedUnsaved = true;
        resolvedSaveOptions = clone(draft.saveOptions) || {};
        preserveCandidateOnFailure.value = true;
        externalChange.value = draft.baseVersion !== latestVersion;
        onCandidate(clone(localCandidate.value));
        return clone(localCandidate.value);
      }
      unresolved.value = draft.state === 'conflicts' || Boolean(draft.conflicts?.length);
      if (draft.baseVersion !== latestVersion) {
        const restoredOrigin = draft.conflictOrigin !== undefined && draft.conflictOrigin !== null
          ? clone(draft.conflictOrigin)
          : clone(baseSnapshot.value);
        const result = merge(restoredOrigin, localCandidate.value, latestSnapshot);
        baseSnapshot.value = latestSnapshot;
        version.value = latestVersion;
        externalChange.value = true;
        if (result.conflicts.length) {
          conflictOrigin = restoredOrigin;
          openConflicts(result, draft.conflicts || [], draft);
        }
        else {
          localCandidate.value = clone(result.content ?? result.categories);
          unresolved.value = false;
          resolving.value = false;
          conflictOrigin = null;
          savedConflicts = [];
          onCandidate(clone(localCandidate.value));
          persistDraft();
        }
      } else if (draft.conflicts?.length && draft.conflictOrigin !== undefined) {
        conflictOrigin = clone(draft.conflictOrigin);
        const result = merge(conflictOrigin, localCandidate.value, latestSnapshot);
        if (result.conflicts.length) openConflicts(result, draft.conflicts, draft);
      }
      return clone(localCandidate.value);
    } catch {
      safeStorageRemove(draftKey, noteStorageFailure);
      return adopt(response);
    }
  }

  function noteExternalVersion(remoteVersion) {
    if (remoteVersion === version.value) return false;
    externalChange.value = true;
    return true;
  }

  function acceptReplacement(response, replacementState) {
    const { snapshot, responseVersion } = responseState(response, 'backup restore');
    baseSnapshot.value = snapshot;
    version.value = responseVersion;
    resolving.value = false;
    unresolved.value = false;
    externalChange.value = false;
    contention.value = '';
    error.value = '';
    activeMerge = null;
    conflictOrigin = null;
    savedConflicts = [];
    resolvedUnsaved = false;
    resolvedSaveOptions = {};
    closeConflictDialog(resource);
    clearFocusReturnTarget();

    if (candidateRevision !== replacementState.revision) {
      dirty.value = true;
      preserveCandidateOnFailure.value = true;
      onCandidate(clone(localCandidate.value));
      persistDraft();
      return clone(localCandidate.value);
    }

    localCandidate.value = clone(snapshot);
    candidateRevision++;
    dirty.value = false;
    preserveCandidateOnFailure.value = false;
    safeStorageRemove(draftKey, noteStorageFailure);
    onAccepted(clone(snapshot), { response, version: version.value });
    return snapshot;
  }

  async function replace(candidate, {
    previewVersion,
    confirmReplacement = () => Promise.resolve(true)
  } = {}) {
    if (!loadRemote) {
      throw new Error(`Cannot replace ${resource} without a remote loader`);
    }

    const replacementState = {
      revision: candidateRevision,
      candidate: clone(localCandidate.value),
      dirty: dirty.value
    };

    return enqueueOperation(async () => {
      let expectedVersion = previewVersion;
      while (true) {
        const latest = await loadRemote();
        if (latest.version !== expectedVersion) {
          const approved = await confirmReplacement(latest);
          if (!approved) return { replaced: false, latest };
        }
        try {
          const saved = await runRemoteSave(candidate, latest.version, { replacement: true });
          acceptReplacement(saved, replacementState);
          return { replaced: true, saved };
        } catch (saveError) {
          if (saveError instanceof ConflictError) {
            expectedVersion = '';
            continue;
          }
          throw saveError;
        }
      }
    });
  }

  function discard() {
    localCandidate.value = clone(baseSnapshot.value);
    dirty.value = false;
    resolving.value = false;
    unresolved.value = false;
    externalChange.value = false;
    activeMerge = null;
    conflictOrigin = null;
    savedConflicts = [];
    resolvedUnsaved = false;
    resolvedSaveOptions = {};
    closeConflictDialog(resource);
    clearFocusReturnTarget();
    safeStorageRemove(draftKey, noteStorageFailure);
  }

  return {
    baseSnapshot,
    version,
    localCandidate,
    dirty,
    resolving,
    externalChange,
    unresolved,
    contention,
    error,
    recoveryWarning,
    preserveCandidateOnFailure,
    inFlight,
    pendingOperations,
    initialize,
    adopt,
    save,
    replace,
    markDirty,
    restoreCandidate,
    noteExternalVersion,
    discard
  };
}
