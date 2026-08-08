import { fetchAuthSession } from 'aws-amplify/auth';
import awsExports from './aws-exports';

const apiConfig = awsExports.aws_cloud_logic_custom?.find((entry) => entry.name === 'AdminQueries');
const apiRoot = apiConfig?.endpoint || '';
const MAX_EVENTS = 350;
const MAX_REMOTE_QUEUE = 200;
const REMOTE_BATCH_SIZE = 20;
const STORAGE_INDEX_KEY = 'cloudkelvin:upload-diagnostics:index';
const STORAGE_REPORT_PREFIX = 'cloudkelvin:upload-diagnostics:';
const MAX_STORED_SESSIONS = 3;

const createId = () => {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const normalizeValue = (value, depth = 0) => {
    if (value === null || value === undefined) return value ?? null;
    if (value instanceof Error) {
        return {
            name: value.name || 'Error',
            message: String(value.message || value).slice(0, 1000),
            stack: value.stack ? String(value.stack).slice(0, 3000) : null,
            code: value.code || value.$metadata?.httpStatusCode || null,
            httpStatusCode: value.$metadata?.httpStatusCode || null,
            requestId: value.$metadata?.requestId || null,
        };
    }
    if (typeof value === 'string') return value.slice(0, 1000);
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (depth >= 4) return '[max-depth]';
    if (Array.isArray(value)) return value.slice(0, 50).map((item) => normalizeValue(item, depth + 1));
    if (typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value)
                .slice(0, 60)
                .filter(([key]) => !/authorization|token|password|secret|credential/i.test(key))
                .map(([key, item]) => [key, normalizeValue(item, depth + 1)])
        );
    }
    return String(value).slice(0, 1000);
};

const getConnectionSnapshot = () => {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    return connection ? {
        effectiveType: connection.effectiveType || null,
        downlinkMbps: connection.downlink ?? null,
        rttMs: connection.rtt ?? null,
        saveData: connection.saveData ?? null,
    } : null;
};

const getDeviceSnapshot = () => {
    const ua = navigator.userAgent || '';
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    return {
        userAgent: ua,
        platform: navigator.platform || null,
        language: navigator.language || null,
        isIOS,
        isStandalone: Boolean(window.navigator.standalone || window.matchMedia?.('(display-mode: standalone)').matches),
        online: navigator.onLine,
        connection: getConnectionSnapshot(),
        deviceMemoryGb: navigator.deviceMemory || null,
        hardwareConcurrency: navigator.hardwareConcurrency || null,
        maxTouchPoints: navigator.maxTouchPoints || 0,
        viewport: { width: window.innerWidth, height: window.innerHeight, pixelRatio: window.devicePixelRatio || 1 },
        screen: { width: window.screen?.width || null, height: window.screen?.height || null },
        visibilityState: document.visibilityState,
    };
};

export const getFileDiagnostic = (file, index) => {
    const name = file?.name || '';
    const extensionMatch = name.match(/\.([^.]+)$/);
    return {
        fileId: `file-${index + 1}`,
        extension: extensionMatch ? extensionMatch[1].toLowerCase().slice(0, 12) : null,
        mimeType: file?.type || null,
        sizeBytes: file?.size || 0,
        lastModified: file?.lastModified ? new Date(file.lastModified).toISOString() : null,
    };
};

export const createUploadDiagnostics = ({ userId, currentFolder }) => {
    const sessionId = createId();
    const startedAt = Date.now();
    const events = [];
    let remoteQueue = [];
    let flushPromise = null;
    let flushAgain = false;
    let persistTimer = null;
    let sequence = 0;
    const listeners = [];

    const getStoredSessionIds = () => {
        try {
            const parsed = JSON.parse(localStorage.getItem(STORAGE_INDEX_KEY) || '[]');
            return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
        } catch (error) {
            return [];
        }
    };

    const registerStoredSession = () => {
        try {
            const sessionIds = [sessionId, ...getStoredSessionIds().filter((id) => id !== sessionId)];
            const retainedIds = sessionIds.slice(0, MAX_STORED_SESSIONS);
            sessionIds.slice(MAX_STORED_SESSIONS).forEach((id) => {
                localStorage.removeItem(`${STORAGE_REPORT_PREFIX}${id}`);
            });
            localStorage.setItem(STORAGE_INDEX_KEY, JSON.stringify(retainedIds));
        } catch (error) {
            // Diagnostics must never interrupt the app.
        }
    };

    registerStoredSession();

    const persist = () => {
        persistTimer = null;
        try {
            localStorage.setItem(`${STORAGE_REPORT_PREFIX}${sessionId}`, JSON.stringify({
                sessionId,
                startedAt: new Date(startedAt).toISOString(),
                device: getDeviceSnapshot(),
                events,
            }));
        } catch (error) {
            // Diagnostics must never interrupt an upload (Safari private mode/quota can reject storage).
        }
    };

    const schedulePersist = () => {
        if (persistTimer) return;
        persistTimer = window.setTimeout(persist, 500);
    };

    const sendBatch = async (batch) => {
        if (!apiRoot || !batch.length) return;
        const session = await fetchAuthSession();
        const token = session.tokens?.accessToken?.toString() || session.tokens?.idToken?.toString();
        if (!token) throw new Error('No authenticated token available for diagnostics');

        const response = await fetch(`${apiRoot}/client-logs/upload`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: token,
            },
            body: JSON.stringify({ sessionId, userId, events: batch }),
            keepalive: true,
        });
        if (!response.ok) throw new Error(`Diagnostics endpoint returned ${response.status}`);
    };

    const flush = async () => {
        if (flushPromise) {
            flushAgain = true;
            return flushPromise;
        }
        if (!remoteQueue.length) return undefined;

        const batch = remoteQueue.splice(0, REMOTE_BATCH_SIZE);
        let succeeded = false;
        flushPromise = sendBatch(batch)
            .then(() => {
                succeeded = true;
            })
            .catch((error) => {
                remoteQueue = [...batch, ...remoteQueue].slice(-MAX_REMOTE_QUEUE);
                console.warn('[upload-diagnostics] remote flush failed', normalizeValue(error));
            })
            .finally(() => {
                flushPromise = null;
                const shouldContinue = succeeded && remoteQueue.length && (flushAgain || remoteQueue.length >= REMOTE_BATCH_SIZE);
                flushAgain = false;
                if (shouldContinue) void flush();
            });
        return flushPromise;
    };

    const log = (level, event, details = {}, { flushNow = false } = {}) => {
        const entry = {
            sequence: ++sequence,
            timestamp: new Date().toISOString(),
            elapsedMs: Date.now() - startedAt,
            level,
            event,
            online: navigator.onLine,
            visibilityState: document.visibilityState,
            details: normalizeValue(details),
        };
        events.push(entry);
        if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
        remoteQueue.push(entry);
        if (remoteQueue.length > MAX_REMOTE_QUEUE) remoteQueue.shift();
        if (flushNow) {
            if (persistTimer) window.clearTimeout(persistTimer);
            persist();
        } else {
            schedulePersist();
        }

        const consoleMethod = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
        console[consoleMethod](`[upload:${sessionId}] ${event}`, entry.details);
        if (flushNow || remoteQueue.length >= 8) void flush();
        return entry;
    };

    const listen = (target, eventName, handler) => {
        target.addEventListener(eventName, handler);
        listeners.push(() => target.removeEventListener(eventName, handler));
    };

    listen(window, 'online', () => log('info', 'browser.online', { connection: getConnectionSnapshot() }, { flushNow: true }));
    listen(window, 'offline', () => log('warn', 'browser.offline', { connection: getConnectionSnapshot() }));
    listen(document, 'visibilitychange', () => log('info', 'browser.visibility_changed', {
        visibilityState: document.visibilityState,
    }, { flushNow: document.visibilityState === 'hidden' }));
    listen(window, 'error', (event) => log('error', 'browser.uncaught_error', {
        message: event.message,
        filename: event.filename,
        line: event.lineno,
        column: event.colno,
        error: event.error,
    }, { flushNow: true }));
    listen(window, 'unhandledrejection', (event) => log('error', 'browser.unhandled_rejection', {
        reason: event.reason,
    }, { flushNow: true }));
    listen(window, 'pagehide', () => {
        log('info', 'browser.pagehide', {}, { flushNow: true });
        if (persistTimer) window.clearTimeout(persistTimer);
        persist();
    });

    log('info', 'diagnostics.session_started', {
        sessionId,
        folderSelected: Boolean(currentFolder),
        device: getDeviceSnapshot(),
    }, { flushNow: true });

    const download = () => {
        if (persistTimer) window.clearTimeout(persistTimer);
        persist();
        const currentReport = {
            sessionId,
            startedAt: new Date(startedAt).toISOString(),
            exportedAt: new Date().toISOString(),
            device: getDeviceSnapshot(),
            events,
        };
        const storedReports = getStoredSessionIds().map((storedSessionId) => {
            try {
                return JSON.parse(localStorage.getItem(`${STORAGE_REPORT_PREFIX}${storedSessionId}`) || 'null');
            } catch (error) {
                return null;
            }
        }).filter(Boolean);
        const reports = [
            currentReport,
            ...storedReports.filter((report) => report.sessionId !== sessionId),
        ].slice(0, MAX_STORED_SESSIONS);
        const blob = new Blob([JSON.stringify({
            exportedAt: new Date().toISOString(),
            currentSessionId: sessionId,
            reports,
        }, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `cloud-kelvin-upload-${sessionId}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    };

    return {
        sessionId,
        log,
        flush,
        download,
        dispose: () => {
            if (persistTimer) window.clearTimeout(persistTimer);
            persist();
            listeners.splice(0).forEach((removeListener) => removeListener());
        },
    };
};
