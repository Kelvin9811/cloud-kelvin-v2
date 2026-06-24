/* eslint-disable */
const express = require('express');
const bodyParser = require('body-parser');
const awsServerlessExpressMiddleware = require('aws-serverless-express/middleware');
const crypto = require('crypto');
const {
  S3Client,
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const {
  addUserToGroup,
  removeUserFromGroup,
  confirmUserSignUp,
  disableUser,
  enableUser,
  getUser,
  listUsers,
  listGroups,
  listGroupsForUser,
  listUsersInGroup,
  signUserOut,
} = require('./cognitoActions');

const app = express();
app.use(bodyParser.json({ limit: '5mb' }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(awsServerlessExpressMiddleware.eventContext());

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

const allowedGroup = process.env.GROUP;
const bucketName = process.env.STORAGE_BUCKET_NAME;
const bucketRegion = process.env.STORAGE_BUCKET_REGION || process.env.AWS_REGION;
const s3 = new S3Client({ region: bucketRegion });

const SHARES_ROOT = 'system/shares';
const SHARE_INDEX_BY_FOLDER_ROOT = `${SHARES_ROOT}/by-folder`;
const SHARE_INDEX_BY_ID_ROOT = `${SHARES_ROOT}/by-id`;
const PUBLIC_PREVIEW_ROOT = `${SHARES_ROOT}/public-previews`;

const normalizeFolderName = (folderName = '') => folderName.trim();
const encodeFolderName = (folderName = '') => Buffer.from(folderName, 'utf8').toString('base64url');
const getFolderPreviewPrefix = (userId, folderName) => `uploads/users/${userId}/${folderName}/previews/`;
const getFolderOriginalPathFromPreview = (previewPath) => previewPath.replace(/\/previews\//, '/original/');
const getShareIndexByFolderKey = (userId, folderName) => `${SHARE_INDEX_BY_FOLDER_ROOT}/${userId}/${encodeFolderName(folderName)}.json`;
const getShareIndexByIdKey = (shareId) => `${SHARE_INDEX_BY_ID_ROOT}/${shareId}.json`;

const createPublicPreviewKey = (shareId, publicId, previewPath) => {
  const filename = previewPath.split('/').pop() || '';
  const extMatch = filename.match(/(\.[^.]+)$/);
  const extension = extMatch ? extMatch[1] : '.jpg';
  return `${PUBLIC_PREVIEW_ROOT}/${shareId}/${publicId}${extension}`;
};

const parseJsonBody = async (stream) => {
  if (!stream) return null;
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : null;
};

const getClaims = (req) => req?.apiGateway?.event?.requestContext?.authorizer?.claims || {};
const getAuthenticatedUserId = (req) => getClaims(req).sub || null;

const maskValue = (value) => {
  if (!value || typeof value !== 'string') return value || null;
  if (value.length <= 16) return `${value.slice(0, 4)}...${value.slice(-4)}`;
  return `${value.slice(0, 10)}...${value.slice(-10)}`;
};

const summarizeRequest = (req) => {
  const claims = getClaims(req);
  const authHeader = req.headers?.authorization || req.headers?.Authorization || null;

  return {
    method: req.method,
    path: req.path,
    query: req.query,
    body: req.body,
    hasAuthorizationHeader: Boolean(authHeader),
    authorizationPreview: maskValue(authHeader),
    requestId: req?.apiGateway?.event?.requestContext?.requestId || null,
    sourceIp: req?.apiGateway?.event?.requestContext?.identity?.sourceIp || null,
    authenticatedSub: claims.sub || null,
    username: claims.username || claims['cognito:username'] || null,
    tokenUse: claims.token_use || null,
    issuer: claims.iss || null,
    clientId: claims.client_id || claims.aud || null,
    groups: claims['cognito:groups'] || null,
  };
};

const ensureSignedInUser = (req, requestedUserId) => {
  const authenticatedUserId = getAuthenticatedUserId(req);
  console.log('[shares] ensureSignedInUser', {
    requestedUserId,
    authenticatedUserId,
    request: summarizeRequest(req),
  });
  if (!authenticatedUserId) {
    const err = new Error('authentication required');
    err.statusCode = 401;
    throw err;
  }
  if (requestedUserId && authenticatedUserId !== requestedUserId) {
    const err = new Error('user mismatch');
    err.statusCode = 403;
    throw err;
  }
  return authenticatedUserId;
};

const listAllObjects = async (prefix) => {
  const items = [];
  let continuationToken = undefined;

  do {
    const response = await s3.send(new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    }));
    items.push(...(response.Contents || []));
    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  return items;
};

const readJsonObject = async (key) => {
  try {
    const response = await s3.send(new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    }));
    return await parseJsonBody(response.Body);
  } catch (error) {
    if (error?.name === 'NoSuchKey' || error?.$metadata?.httpStatusCode === 404) {
      return null;
    }
    throw error;
  }
};

const putJsonObject = async (key, value) => {
  await s3.send(new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: JSON.stringify(value, null, 2),
    ContentType: 'application/json',
  }));
};

const deleteObjectIfExists = async (key) => {
  try {
    await s3.send(new DeleteObjectCommand({
      Bucket: bucketName,
      Key: key,
    }));
  } catch (error) {
    console.warn('Failed to delete object', key, error);
  }
};

const buildSignedObjectUrl = async (key, expiresIn = 3600) => {
  return getSignedUrl(s3, new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
  }), { expiresIn });
};

const getFolderShareRecord = async (userId, folderName) => {
  return readJsonObject(getShareIndexByFolderKey(userId, folderName));
};

const publishFolderShare = async (userId, folderName) => {
  const normalizedFolder = normalizeFolderName(folderName);
  if (!normalizedFolder) {
    const err = new Error('folderName is required');
    err.statusCode = 400;
    throw err;
  }

  const existing = await getFolderShareRecord(userId, normalizedFolder);
  if (existing?.shareId) {
    return existing;
  }

  const previewPrefix = getFolderPreviewPrefix(userId, normalizedFolder);
  const previews = await listAllObjects(previewPrefix);
  const previewObjects = previews.filter((item) => item.Key && !item.Key.split('/').pop().startsWith('CODIGOUNICODECARPETASKOR'));

  if (previewObjects.length === 0) {
    const err = new Error('folder has no previews to share');
    err.statusCode = 404;
    throw err;
  }

  const shareId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const items = [];

  for (const previewObject of previewObjects) {
    const previewPath = previewObject.Key;
    const originalPath = getFolderOriginalPathFromPreview(previewPath);
    const publicId = crypto.randomUUID();
    const publicPreviewPath = createPublicPreviewKey(shareId, publicId, previewPath);
    const originalName = previewPath.split('/').pop() || publicId;

    await s3.send(new CopyObjectCommand({
      Bucket: bucketName,
      CopySource: `${bucketName}/${encodeURIComponent(previewPath).replace(/%2F/g, '/')}`,
      Key: publicPreviewPath,
      MetadataDirective: 'COPY',
    }));

    items.push({
      publicId,
      originalName,
      previewPath,
      originalPath,
      publicPreviewPath,
    });
  }

  const record = {
    shareId,
    userId,
    folderName: normalizedFolder,
    createdAt,
    items,
  };

  await putJsonObject(getShareIndexByFolderKey(userId, normalizedFolder), record);
  await putJsonObject(getShareIndexByIdKey(shareId), record);
  return record;
};

const unpublishFolderShare = async (userId, folderName) => {
  const normalizedFolder = normalizeFolderName(folderName);
  const existing = await getFolderShareRecord(userId, normalizedFolder);
  if (!existing?.shareId) {
    return { deleted: false };
  }

  for (const item of existing.items || []) {
    await deleteObjectIfExists(item.publicPreviewPath);
  }

  await deleteObjectIfExists(getShareIndexByFolderKey(userId, normalizedFolder));
  await deleteObjectIfExists(getShareIndexByIdKey(existing.shareId));
  return { deleted: true, shareId: existing.shareId };
};

const getShareRecordById = async (shareId) => {
  if (!shareId) return null;
  return readJsonObject(getShareIndexByIdKey(shareId));
};

const checkGroup = function (req, res, next) {
  if (req.path === '/signUserOut' || req.path.startsWith('/shares') || req.path.startsWith('/public/')) {
    return next();
  }

  if (typeof allowedGroup === 'undefined' || allowedGroup === 'NONE') {
    return next();
  }

  if (req.apiGateway.event.requestContext.authorizer.claims['cognito:groups']) {
    const groups = req.apiGateway.event.requestContext.authorizer.claims['cognito:groups'].split(',');
    if (!(allowedGroup && groups.indexOf(allowedGroup) > -1)) {
      const err = new Error('User does not have permissions to perform administrative tasks');
      return next(err);
    }
  } else {
    const err = new Error('User does not have permissions to perform administrative tasks');
    err.statusCode = 403;
    return next(err);
  }
  next();
};

app.all('*', checkGroup);

app.get('/shares/status', async (req, res, next) => {
  try {
    console.log('[shares] GET /shares/status start', summarizeRequest(req));
    const userId = ensureSignedInUser(req, req.query.userId);
    const folderName = normalizeFolderName(req.query.folderName);
    if (!folderName) {
      console.log('[shares] GET /shares/status no folderName provided');
      return res.status(200).json({ shared: false });
    }

    const record = await getFolderShareRecord(userId, folderName);
    if (!record?.shareId) {
      console.log('[shares] GET /shares/status share not found', { userId, folderName });
      return res.status(200).json({ shared: false });
    }

    console.log('[shares] GET /shares/status share found', {
      userId,
      folderName,
      shareId: record.shareId,
      itemCount: (record.items || []).length,
    });
    res.status(200).json({
      shared: true,
      shareId: record.shareId,
      folderName: record.folderName,
      publicUrlPath: `/shared/${record.shareId}`,
      itemCount: (record.items || []).length,
    });
  } catch (err) {
    next(err);
  }
});

app.post('/shares/publish', async (req, res, next) => {
  try {
    console.log('[shares] POST /shares/publish start', summarizeRequest(req));
    const userId = ensureSignedInUser(req, req.body.userId);
    const folderName = normalizeFolderName(req.body.folderName);
    const record = await publishFolderShare(userId, folderName);

    console.log('[shares] POST /shares/publish success', {
      userId,
      folderName,
      shareId: record.shareId,
      itemCount: (record.items || []).length,
    });
    res.status(200).json({
      shareId: record.shareId,
      folderName: record.folderName,
      publicUrlPath: `/shared/${record.shareId}`,
      itemCount: (record.items || []).length,
    });
  } catch (err) {
    next(err);
  }
});

app.post('/shares/unpublish', async (req, res, next) => {
  try {
    console.log('[shares] POST /shares/unpublish start', summarizeRequest(req));
    const userId = ensureSignedInUser(req, req.body.userId);
    const folderName = normalizeFolderName(req.body.folderName);
    const result = await unpublishFolderShare(userId, folderName);
    console.log('[shares] POST /shares/unpublish result', {
      userId,
      folderName,
      result,
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

app.get('/public/shares/:shareId', async (req, res, next) => {
  try {
    const record = await getShareRecordById(req.params.shareId);
    if (!record?.shareId) {
      const err = new Error('share not found');
      err.statusCode = 404;
      throw err;
    }

    const items = await Promise.all((record.items || []).map(async (item) => ({
      publicId: item.publicId,
      originalName: item.originalName,
      previewUrl: await buildSignedObjectUrl(item.publicPreviewPath, 3600),
      previewPath: item.publicPreviewPath,
    })));

    res.status(200).json({
      shareId: record.shareId,
      folderName: record.folderName,
      itemCount: items.length,
      items,
    });
  } catch (err) {
    next(err);
  }
});

app.get('/public/shares/:shareId/items/:publicId/original', async (req, res, next) => {
  try {
    const record = await getShareRecordById(req.params.shareId);
    if (!record?.shareId) {
      const err = new Error('share not found');
      err.statusCode = 404;
      throw err;
    }

    const item = (record.items || []).find((entry) => entry.publicId === req.params.publicId);
    if (!item?.originalPath) {
      const err = new Error('shared item not found');
      err.statusCode = 404;
      throw err;
    }

    const url = await buildSignedObjectUrl(item.originalPath, 900);
    res.status(200).json({
      publicId: item.publicId,
      originalName: item.originalName,
      url,
    });
  } catch (err) {
    next(err);
  }
});

app.post('/addUserToGroup', async (req, res, next) => {
  if (!req.body.username || !req.body.groupname) {
    const err = new Error('username and groupname are required');
    err.statusCode = 400;
    return next(err);
  }

  try {
    const response = await addUserToGroup(req.body.username, req.body.groupname);
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
});

app.post('/removeUserFromGroup', async (req, res, next) => {
  if (!req.body.username || !req.body.groupname) {
    const err = new Error('username and groupname are required');
    err.statusCode = 400;
    return next(err);
  }

  try {
    const response = await removeUserFromGroup(req.body.username, req.body.groupname);
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
});

app.post('/confirmUserSignUp', async (req, res, next) => {
  if (!req.body.username) {
    const err = new Error('username is required');
    err.statusCode = 400;
    return next(err);
  }

  try {
    const response = await confirmUserSignUp(req.body.username);
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
});

app.post('/disableUser', async (req, res, next) => {
  if (!req.body.username) {
    const err = new Error('username is required');
    err.statusCode = 400;
    return next(err);
  }

  try {
    const response = await disableUser(req.body.username);
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
});

app.post('/enableUser', async (req, res, next) => {
  if (!req.body.username) {
    const err = new Error('username is required');
    err.statusCode = 400;
    return next(err);
  }

  try {
    const response = await enableUser(req.body.username);
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
});

app.get('/getUser', async (req, res, next) => {
  if (!req.query.username) {
    const err = new Error('username is required');
    err.statusCode = 400;
    return next(err);
  }

  try {
    const response = await getUser(req.query.username);
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
});

app.get('/listUsers', async (req, res, next) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit) : 25;
    const response = await listUsers(limit, req.query.token);
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
});

app.get('/listGroups', async (req, res, next) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit) : 25;
    const response = await listGroups(limit, req.query.token);
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
});

app.get('/listGroupsForUser', async (req, res, next) => {
  if (!req.query.username) {
    const err = new Error('username is required');
    err.statusCode = 400;
    return next(err);
  }

  try {
    const limit = req.query.limit ? parseInt(req.query.limit) : 25;
    const response = await listGroupsForUser(req.query.username, limit, req.query.token);
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
});

app.get('/listUsersInGroup', async (req, res, next) => {
  if (!req.query.groupname) {
    const err = new Error('groupname is required');
    err.statusCode = 400;
    return next(err);
  }

  try {
    const limit = req.query.limit ? parseInt(req.query.limit) : 25;
    const response = await listUsersInGroup(req.query.groupname, limit, req.query.token);
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
});

app.post('/signUserOut', async (req, res, next) => {
  if (
    req.body.username != req.apiGateway.event.requestContext.authorizer.claims.username &&
    req.body.username != /[^/]*$/.exec(req.apiGateway.event.requestContext.identity.userArn)[0]
  ) {
    const err = new Error('only the user can sign themselves out');
    err.statusCode = 400;
    return next(err);
  }

  try {
    const response = await signUserOut(req.body.username);
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
});

app.use((err, req, res, next) => {
  console.error('[app] request failed', {
    errorMessage: err?.message,
    statusCode: err?.statusCode || 500,
    stack: err?.stack,
    request: req ? summarizeRequest(req) : null,
  });
  if (!err.statusCode) err.statusCode = 500;
  res.status(err.statusCode).json({ message: err.message }).end();
});

app.listen(3000, () => {
  console.log('App started');
});

module.exports = app;
