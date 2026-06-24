import awsExports from './aws-exports';
import { fetchAuthSession } from 'aws-amplify/auth';

const apiConfig = awsExports.aws_cloud_logic_custom?.find((entry) => entry.name === 'AdminQueries');
const publicApiConfig = awsExports.aws_cloud_logic_custom?.find((entry) => entry.name === 'PublicShares');
const apiRoot = apiConfig?.endpoint || '';
const publicApiRoot = publicApiConfig?.endpoint || apiRoot;

const maskToken = (token) => {
    if (!token) return null;
    if (token.length <= 16) return `${token.slice(0, 4)}...${token.slice(-4)}`;
    return `${token.slice(0, 10)}...${token.slice(-10)}`;
};

const decodeJwtPayload = (token) => {
    try {
        const parts = token.split('.');
        if (parts.length < 2) {
            return null;
        }

        const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
        const json = atob(padded);
        return JSON.parse(json);
    } catch (error) {
        console.warn('[shareApi] No se pudo decodificar el payload del JWT', error);
        return null;
    }
};

const logTokenSummary = (label, token) => {
    const payload = decodeJwtPayload(token);
    console.log(`[shareApi] ${label}`, {
        exists: Boolean(token),
        masked: maskToken(token),
        tokenUse: payload?.token_use || null,
        sub: payload?.sub || null,
        username: payload?.username || payload?.['cognito:username'] || null,
        clientId: payload?.client_id || payload?.aud || null,
        exp: payload?.exp ? new Date(payload.exp * 1000).toISOString() : null,
        iat: payload?.iat ? new Date(payload.iat * 1000).toISOString() : null,
        iss: payload?.iss || null,
    });
};

const buildUrl = (path, query = null) => {
    const url = new URL(`${apiRoot}${path}`);
    if (query) {
        Object.entries(query).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '') {
                url.searchParams.set(key, value);
            }
        });
    }
    return url.toString();
};

const buildPublicUrl = (path) => {
    return new URL(`${publicApiRoot}${path}`).toString();
};

const getAuthHeaders = async () => {
    const session = await fetchAuthSession();
    const idToken = session.tokens?.idToken?.toString() || null;
    const accessToken = session.tokens?.accessToken?.toString() || null;

    console.log('[shareApi] fetchAuthSession summary', {
        hasTokens: Boolean(session.tokens),
        hasIdToken: Boolean(idToken),
        hasAccessToken: Boolean(accessToken),
    });
    logTokenSummary('idToken summary', idToken);
    logTokenSummary('accessToken summary', accessToken);

    const token = accessToken || idToken;
    console.log('[shareApi] Authorization token selected', {
        selected: accessToken ? 'accessToken' : idToken ? 'idToken' : 'none',
        masked: maskToken(token),
    });

    return token ? { Authorization: token } : {};
};

const handleJsonResponse = async (response) => {
    const payload = await response.json().catch(() => ({}));
    console.log('[shareApi] Response received', {
        url: response.url,
        status: response.status,
        ok: response.ok,
        payload,
    });
    if (!response.ok) {
        throw new Error(payload?.message || `Request failed with ${response.status}`);
    }
    return payload;
};

export const getShareStatus = async ({ userId, folderName }) => {
    const headers = await getAuthHeaders();
    const url = buildUrl('/shares/status', { userId, folderName });
    console.log('[shareApi] Sending getShareStatus', {
        url,
        userId,
        folderName,
        hasAuthorization: Boolean(headers.Authorization),
        authorizationPreview: maskToken(headers.Authorization),
    });
    const response = await fetch(url, {
        method: 'GET',
        headers,
    });
    return handleJsonResponse(response);
};

export const publishShare = async ({ userId, folderName }) => {
    const headers = await getAuthHeaders();
    const url = buildUrl('/shares/publish');
    console.log('[shareApi] Sending publishShare', {
        url,
        userId,
        folderName,
        hasAuthorization: Boolean(headers.Authorization),
        authorizationPreview: maskToken(headers.Authorization),
    });
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...headers,
        },
        body: JSON.stringify({ userId, folderName }),
    });
    return handleJsonResponse(response);
};

export const unpublishShare = async ({ userId, folderName }) => {
    const headers = await getAuthHeaders();
    const url = buildUrl('/shares/unpublish');
    console.log('[shareApi] Sending unpublishShare', {
        url,
        userId,
        folderName,
        hasAuthorization: Boolean(headers.Authorization),
        authorizationPreview: maskToken(headers.Authorization),
    });
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...headers,
        },
        body: JSON.stringify({ userId, folderName }),
    });
    return handleJsonResponse(response);
};

export const getPublicShare = async (shareId) => {
    const path = publicApiConfig ? `/shares/${shareId}` : `/public/shares/${shareId}`;
    console.log('[shareApi] Sending getPublicShare', {
        path,
        publicApiRoot,
        usingDedicatedPublicApi: Boolean(publicApiConfig),
        shareId,
    });
    const response = await fetch(buildPublicUrl(path), {
        method: 'GET',
    });
    return handleJsonResponse(response);
};

export const getPublicOriginal = async (shareId, publicId) => {
    const path = publicApiConfig
        ? `/shares/${shareId}/items/${publicId}/original`
        : `/public/shares/${shareId}/items/${publicId}/original`;
    console.log('[shareApi] Sending getPublicOriginal', {
        path,
        publicApiRoot,
        usingDedicatedPublicApi: Boolean(publicApiConfig),
        shareId,
        publicId,
    });
    const response = await fetch(buildPublicUrl(path), {
        method: 'GET',
    });
    return handleJsonResponse(response);
};
