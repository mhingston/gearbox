import { readFileSync } from 'node:fs';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function runtimeDirFor(root) {
  return join(
    tmpdir(),
    'gearbox-hooks',
    Buffer.from(root).toString('base64url')
  );
}

export function runtimeArtifactsDirFor(root) {
  return join(runtimeDirFor(root), 'artifacts');
}

function legacyRepoRuntimeDirFor(root) {
  return join(root, '.gearbox', 'hooks', '.runtime');
}

function legacyModifiedFilesPathFor(root) {
  return join(legacyRepoRuntimeDirFor(root), 'modified-files.json');
}

function legacyLastTestResultPathFor(root) {
  return join(legacyRepoRuntimeDirFor(root), 'last-test-result.json');
}

function encodedSessionId(sessionId) {
  return Buffer.from(String(sessionId), 'utf8').toString('base64url');
}

export function modifiedFilesArtifactPathFor(root, sessionId) {
  return sessionId
    ? join(
        runtimeArtifactsDirFor(root),
        `${encodedSessionId(sessionId)}.modified-files.json`
      )
    : null;
}

export function lastTestResultArtifactPathFor(root, sessionId) {
  return sessionId
    ? join(
        runtimeArtifactsDirFor(root),
        `${encodedSessionId(sessionId)}.last-test-result.json`
      )
    : null;
}

function readOptionalJsonFile(filePath) {
  if (!filePath) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function readSessionArtifact(filePath, sessionId) {
  const artifact = readOptionalJsonFile(filePath);
  if (!artifact) {
    return null;
  }

  if (artifact.sessionId && artifact.sessionId !== sessionId) {
    return null;
  }

  return artifact;
}

export function readRuntimeArtifactsForSession(root, sessionId = null) {
  return {
    modifiedFiles: readSessionArtifact(
      modifiedFilesArtifactPathFor(root, sessionId),
      sessionId
    ),
    lastTestResult: readSessionArtifact(
      lastTestResultArtifactPathFor(root, sessionId),
      sessionId
    ),
  };
}

export async function writeModifiedFilesArtifact(root, sessionId, files) {
  if (!sessionId || !Array.isArray(files) || files.length === 0) {
    return;
  }

  const existing = readSessionArtifact(
    modifiedFilesArtifactPathFor(root, sessionId),
    sessionId
  );
  const priorFiles = Array.isArray(existing?.files) ? existing.files : [];
  const mergedFiles = [...new Set([...priorFiles, ...files])].slice(-25);
  const filePath = modifiedFilesArtifactPathFor(root, sessionId);
  if (!filePath) {
    return;
  }

  await mkdir(runtimeArtifactsDirFor(root), { recursive: true });
  await writeFile(
    filePath,
    `${JSON.stringify(
      {
        sessionId,
        updatedAt: new Date().toISOString(),
        files: mergedFiles,
      },
      null,
      2
    )}\n`,
    'utf8'
  );
}

export async function writeLastTestResultArtifact(
  root,
  sessionId,
  {
    status,
    toolName = 'bash',
    command = 'unknown command',
  }
) {
  if (!sessionId || !status) {
    return;
  }

  const filePath = lastTestResultArtifactPathFor(root, sessionId);
  if (!filePath) {
    return;
  }

  await mkdir(runtimeArtifactsDirFor(root), { recursive: true });
  await writeFile(
    filePath,
    `${JSON.stringify(
      {
        sessionId,
        updatedAt: new Date().toISOString(),
        status,
        toolName,
        command,
      },
      null,
      2
    )}\n`,
    'utf8'
  );
}

export async function resetRuntimeArtifacts(root, sessionId = null) {
  const targets = [
    legacyModifiedFilesPathFor(root),
    legacyLastTestResultPathFor(root),
  ];

  if (sessionId) {
    targets.push(
      modifiedFilesArtifactPathFor(root, sessionId),
      lastTestResultArtifactPathFor(root, sessionId)
    );
  } else {
    targets.push(runtimeArtifactsDirFor(root));
  }

  for (const targetPath of targets) {
    if (!targetPath) {
      continue;
    }

    await rm(targetPath, { recursive: true, force: true });
  }
}
