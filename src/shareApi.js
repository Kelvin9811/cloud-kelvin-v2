import awsExports from './aws-exports';
import { fetchAuthSession } from 'aws-amplify/auth';

const apiConfig = awsExports.aws_cloud_logic_custom?.find((entry) => entry.name === 'AdminQueries');
const apiRoot = apiConfig?.endpoint || '';

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

const getAuthHeaders = async () => {
    const session = await fetchAuthSession();
    const token = session.tokens?.idToken?.toString() || session.tokens?.accessToken?.toString();
    return token ? { Authorization: token } : {};
};

const handleJsonResponse = async (response) => {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload?.message || `Request failed with ${response.status}`);
    }
    return payload;
};

export const getShareStatus = async ({ userId, folderName }) => {
    const headers = await getAuthHeaders();
    const response = await fetch(buildUrl('/shares/status', { userId, folderName }), {
        method: 'GET',
        headers,
    });
    return handleJsonResponse(response);
};

export const publishShare = async ({ userId, folderName }) => {
    const headers = await getAuthHeaders();
    const response = await fetch(buildUrl('/shares/publish'), {
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
    const response = await fetch(buildUrl('/shares/unpublish'), {
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
    const response = await fetch(buildUrl(`/public/shares/${shareId}`), {
        method: 'GET',
    });
    return handleJsonResponse(response);
};

export const getPublicOriginal = async (shareId, publicId) => {
    const response = await fetch(buildUrl(`/public/shares/${shareId}/items/${publicId}/original`), {
        method: 'GET',
    });
    return handleJsonResponse(response);
};
