import React, { useRef, useState } from 'react';
import './UploadPage.css';
import { getUrl, list, remove, uploadData } from '@aws-amplify/storage';
import PdfLogo from '../images/pdf_logo.png';
import WordLogo from '../images/word_logo.png';
import ExcelLogo from '../images/excel_logo.png';
import PowerPointLogo from '../images/powerpoint_logo.png';
import ZipLogo from '../images/zip_logo.png';
import CodeLogo from '../images/code_logo.png';
import AudioLogo from '../images/audio_logo.png';
import FileLogo from '../images/file_logo.png';

const EMPTY_SUMMARY = {
    total: 0,
    processed: 0,
    uploaded: 0,
    duplicates: 0,
    errors: 0,
    canceled: 0,
    finished: false,
    canceledByUser: false,
};

const UploadPage = ({ onUpload, onBack, userId = '', currentFolder = '' }) => {
    const [files, setFiles] = useState([]);
    const [isUploading, setIsUploading] = useState(false);
    const [cancelRequested, setCancelRequested] = useState(false);
    const uploadStatusesRef = useRef({});
    const [batchSize] = useState(10);
    const [uploadSummary, setUploadSummary] = useState({ ...EMPTY_SUMMARY });
    const [failedFiles, setFailedFiles] = useState([]);
    const [currentBatch, setCurrentBatch] = useState({ current: 0, total: 0 });

    const fileInputRef = useRef(null);
    const cancelRequestedRef = useRef(false);

    const withTimeout = (promise, ms, label) =>
        new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
            promise
                .then((value) => {
                    clearTimeout(timer);
                    resolve(value);
                })
                .catch((error) => {
                    clearTimeout(timer);
                    reject(error);
                });
        });

    const normalizeFileName = (name = '') => name.trim().replace(/\s+/g, '_').toLowerCase();
    const getBasePath = () => currentFolder ? `uploads/users/${userId}/${currentFolder}` : `uploads/users/${userId}`;
    const getOriginalListPath = () => `${getBasePath()}/original/`;
    const replaceFileExtension = (name = '', nextExtension = '.jpg') => {
        const cleanExtension = nextExtension.startsWith('.') ? nextExtension : `.${nextExtension}`;
        return /\.[^.]+$/.test(name) ? name.replace(/\.[^.]+$/, cleanExtension) : `${name}${cleanExtension}`;
    };

    const extractComparableOriginalName = (path = '') => {
        const filename = path.split('/').pop() || '';
        const match = filename.match(/^\d{8}_\d{6}_[^_]+_(.+)$/);
        return normalizeFileName(match ? match[1] : filename);
    };

    const listAllItems = async (path) => {
        const allItems = [];
        let nextToken = undefined;

        do {
            const result = await list({
                path,
                options: { pageSize: 1000, nextToken }
            });

            allItems.push(...(result.items || []));
            nextToken = result.nextToken || undefined;
        } while (nextToken);

        return allItems;
    };

    const resetUploadState = () => {
        cancelRequestedRef.current = false;
        setCancelRequested(false);
        uploadStatusesRef.current = {};
        setUploadSummary({ ...EMPTY_SUMMARY });
        setFailedFiles([]);
        setCurrentBatch({ current: 0, total: 0 });
    };

    const handleFiles = (e) => {
        const selectedFiles = Array.from(e.target.files || []);
        setFiles(selectedFiles);
        resetUploadState();
    };

    const handleClearAll = () => {
        console.log('Clearing selected files and upload statuses');
        setFiles([]);
        setIsUploading(false);
        resetUploadState();
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const formatFileDate = (ts) => {
        const d = new Date(ts || Date.now());
        const pad = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    };

    const parseExifDateString = (value) => {
        if (!value || typeof value !== 'string') return null;
        const match = value.match(/^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/);
        if (!match) return null;

        const [, year, month, day, hour, minute, second] = match;
        const parsed = new Date(
            Number(year),
            Number(month) - 1,
            Number(day),
            Number(hour),
            Number(minute),
            Number(second)
        );

        return Number.isNaN(parsed.getTime()) ? null : parsed;
    };

    const getExifCaptureDate = async (file) => {
        const lowerName = (file?.name || '').toLowerCase();
        const type = (file?.type || '').toLowerCase();
        const isSupportedImage =
            type === 'image/jpeg' ||
            type === 'image/tiff' ||
            /\.jpe?g$/.test(lowerName) ||
            /\.tiff?$/.test(lowerName);

        if (!isSupportedImage) return null;

        try {
            const buffer = await file.arrayBuffer();
            const view = new DataView(buffer);

            if (view.byteLength < 4 || view.getUint16(0, false) !== 0xFFD8) {
                return null;
            }

            let offset = 2;
            while (offset + 4 < view.byteLength) {
                const marker = view.getUint16(offset, false);
                offset += 2;

                if (marker === 0xFFDA || marker === 0xFFD9) break;
                if ((marker & 0xFF00) !== 0xFF00) break;
                if (offset + 2 > view.byteLength) break;

                const segmentLength = view.getUint16(offset, false);
                if (segmentLength < 2 || offset + segmentLength > view.byteLength) break;

                if (marker === 0xFFE1 && segmentLength >= 8) {
                    const exifHeader = String.fromCharCode(
                        view.getUint8(offset + 2),
                        view.getUint8(offset + 3),
                        view.getUint8(offset + 4),
                        view.getUint8(offset + 5),
                        view.getUint8(offset + 6),
                        view.getUint8(offset + 7)
                    );

                    if (exifHeader === 'Exif\0\0') {
                        const tiffStart = offset + 8;
                        if (tiffStart + 8 > view.byteLength) return null;

                        const byteOrder = view.getUint16(tiffStart, false);
                        const littleEndian = byteOrder === 0x4949;
                        if (!littleEndian && byteOrder !== 0x4D4D) return null;

                        const getUint16At = (position) => view.getUint16(position, littleEndian);
                        const getUint32At = (position) => view.getUint32(position, littleEndian);
                        const firstIfdOffset = getUint32At(tiffStart + 4);

                        const readAsciiAt = (entryOffset, typeId, count) => {
                            if (typeId !== 2 || count <= 0) return null;
                            const valueOffset = count <= 4
                                ? entryOffset + 8
                                : tiffStart + getUint32At(entryOffset + 8);
                            if (valueOffset + count > view.byteLength) return null;

                            let text = '';
                            for (let i = 0; i < count - 1; i += 1) {
                                text += String.fromCharCode(view.getUint8(valueOffset + i));
                            }
                            return text;
                        };

                        const readIfd = (relativeOffset) => {
                            const ifdOffset = tiffStart + relativeOffset;
                            if (ifdOffset + 2 > view.byteLength) return null;

                            const entryCount = getUint16At(ifdOffset);
                            for (let i = 0; i < entryCount; i += 1) {
                                const entryOffset = ifdOffset + 2 + (i * 12);
                                if (entryOffset + 12 > view.byteLength) return null;

                                const tag = getUint16At(entryOffset);
                                const typeId = getUint16At(entryOffset + 2);
                                const count = getUint32At(entryOffset + 4);

                                if (tag === 0x9003 || tag === 0x9004 || tag === 0x0132) {
                                    const value = readAsciiAt(entryOffset, typeId, count);
                                    const parsedDate = parseExifDateString(value);
                                    if (parsedDate) return parsedDate;
                                }

                                if (tag === 0x8769) {
                                    const nestedIfdOffset = getUint32At(entryOffset + 8);
                                    const nestedDate = readIfd(nestedIfdOffset);
                                    if (nestedDate) return nestedDate;
                                }
                            }

                            return null;
                        };

                        return readIfd(firstIfdOffset);
                    }
                }

                offset += segmentLength;
            }
        } catch (error) {
            console.warn('No se pudo leer EXIF de la imagen, se usara lastModified', error);
        }

        return null;
    };

    const getPreferredFileDate = async (file) => {
        const captureDate = await getExifCaptureDate(file);
        if (captureDate) {
            return { date: captureDate, source: 'captureDate' };
        }

        return {
            date: new Date(file?.lastModified || Date.now()),
            source: 'lastModified'
        };
    };

    const getDuplicateNameSet = async (filesToCheck) => {
        const duplicateNames = new Set();
        const normalizedNames = filesToCheck.map((file) => normalizeFileName(file.name));
        const seenInSelection = new Set();

        normalizedNames.forEach((name) => {
            if (seenInSelection.has(name)) {
                duplicateNames.add(name);
            } else {
                seenInSelection.add(name);
            }
        });

        if (!userId) return duplicateNames;

        try {
            const existingItems = await listAllItems(getOriginalListPath());
            const existingNames = new Set(existingItems.map((item) => extractComparableOriginalName(item.path)));

            normalizedNames.forEach((name) => {
                if (existingNames.has(name)) {
                    duplicateNames.add(name);
                }
            });
        } catch (error) {
            console.warn('No se pudo validar duplicados contra S3', error);
        }

        return duplicateNames;
    };

    const registerOutcome = ({ index, status, fileName, reason }) => {
        uploadStatusesRef.current = { ...uploadStatusesRef.current, [index]: status };
        setUploadSummary((prev) => ({
            ...prev,
            processed: prev.processed + 1,
            uploaded: prev.uploaded + (status === 'done' ? 1 : 0),
            duplicates: prev.duplicates + (status === 'duplicate' ? 1 : 0),
            errors: prev.errors + (status === 'error' ? 1 : 0),
            canceled: prev.canceled + (status === 'canceled' ? 1 : 0),
        }));

        if (status !== 'done' && reason) {
            setFailedFiles((prev) => [...prev, { name: fileName, reason }]);
        }
    };

    const markRemainingFilesAsCanceled = (pendingFiles, startIndex) => {
        if (!pendingFiles.length) return;

        const pendingStatuses = {};
        pendingFiles.forEach((file, offset) => {
            pendingStatuses[startIndex + offset] = 'canceled';
        });

        uploadStatusesRef.current = { ...uploadStatusesRef.current, ...pendingStatuses };
        setUploadSummary((prev) => ({
            ...prev,
            processed: prev.processed + pendingFiles.length,
            canceled: prev.canceled + pendingFiles.length,
        }));
        setFailedFiles((prev) => [
            ...prev,
            ...pendingFiles.map((file) => ({
                name: file.name,
                reason: 'Cancelado por el usuario',
            })),
        ]);
    };

    const cleanupPartialUpload = async (previewPath, finalPath, displayPath) => {
        await Promise.allSettled(
            [previewPath, finalPath, displayPath]
                .filter(Boolean)
                .map((path) => remove({ path }))
        );
    };

    const uploadFiles = async (selectedFiles) => {
        if (!selectedFiles || selectedFiles.length === 0) return [];

        const results = [];
        const toUpload = Array.from(selectedFiles);
        const safeBatchSize = Math.max(1, Number(batchSize) || 10);
        const duplicateNames = await getDuplicateNameSet(toUpload);
        const totalBatches = Math.max(1, Math.ceil(toUpload.length / safeBatchSize));

        const uploadSingle = async (file, idx) => {
            if (cancelRequestedRef.current) {
                registerOutcome({
                    index: idx,
                    status: 'canceled',
                    fileName: file.name,
                    reason: 'Cancelado por el usuario',
                });
                return { skipped: true, reason: 'canceled', name: file.name };
            }

            const normalizedName = normalizeFileName(file.name);
            if (duplicateNames.has(normalizedName)) {
                console.warn('Skipping duplicate file:', file.name);
                registerOutcome({
                    index: idx,
                    status: 'duplicate',
                    fileName: file.name,
                    reason: 'Duplicado en la seleccion o ya existe en la carpeta',
                });
                return { skipped: true, reason: 'duplicate', name: file.name };
            }

            uploadStatusesRef.current = { ...uploadStatusesRef.current, [idx]: 'uploading' };

            const uuid = crypto.randomUUID();
            const cleanName = file.name.replace(/\s+/g, '_');
            const { date: preferredDate, source: preferredDateSource } = await getPreferredFileDate(file);
            const preferredTimestamp = preferredDate?.getTime?.() || file.lastModified || Date.now();
            const fileDateToken = formatFileDate(preferredTimestamp);
            const preferredDateIso = new Date(preferredTimestamp).toISOString();

            const basePath = getBasePath();
            const previewPath = `${basePath}/previews/${fileDateToken}_${uuid}_${cleanName}`;
            const finalPath = `${basePath}/original/${fileDateToken}_${uuid}_${cleanName}`;
            const shouldCreateDisplayImage = isHeicLikeFile(file);
            const displayFileName = replaceFileExtension(cleanName, '.jpg');
            const displayPath = shouldCreateDisplayImage
                ? `${basePath}/display/${fileDateToken}_${uuid}_${displayFileName}`
                : null;

            console.log(`Prepared upload for file="${file.name}" finalName="${fileDateToken}_${uuid}_${cleanName}" dateSource="${preferredDateSource}" dateIso="${preferredDateIso}"`);
            console.log('Upload paths -> preview:', previewPath, ' final:', finalPath, ' display:', displayPath);

            let previewBlob = null;
            try {
                previewBlob = await withTimeout(createPreview(file), 30000, `preview generation for ${file.name}`);
            } catch (previewError) {
                console.warn('Preview generation failed or timed out, continuing without preview for', file.name, previewError);
            }

            let displayBlob = null;
            if (shouldCreateDisplayImage) {
                try {
                    displayBlob = await withTimeout(createDisplayImage(file), 45000, `display generation for ${file.name}`);
                } catch (displayError) {
                    console.warn('Display generation failed or timed out, continuing without display for', file.name, displayError);
                }
            }

            const dataURLtoBlob = (dataurl) => {
                const arr = dataurl.split(',');
                const mime = arr[0].match(/:(.*?);/)[1];
                const bstr = atob(arr[1]);
                let n = bstr.length;
                const u8arr = new Uint8Array(n);
                while (n--) {
                    u8arr[n] = bstr.charCodeAt(n);
                }
                return new Blob([u8arr], { type: mime });
            };

            let previewToUpload = previewBlob;
            if (Array.isArray(previewBlob) && previewBlob.length > 0) {
                previewToUpload = previewBlob[0];
            }
            if (typeof previewToUpload === 'string' && previewToUpload.startsWith('data:')) {
                try {
                    previewToUpload = dataURLtoBlob(previewToUpload);
                } catch (error) {
                    console.warn('Failed to convert dataURL to Blob for preview, will skip preview upload', error);
                    previewToUpload = null;
                }
            }

            let previewUploaded = false;
            let displayUploaded = false;

            try {
                if (cancelRequestedRef.current) {
                    registerOutcome({
                        index: idx,
                        status: 'canceled',
                        fileName: file.name,
                        reason: 'Cancelado por el usuario',
                    });
                    return { skipped: true, reason: 'canceled', name: file.name };
                }

                if (previewToUpload) {
                    await withTimeout(uploadData({
                        path: previewPath,
                        data: previewToUpload,
                        options: {
                            contentType: 'image/jpeg',
                        },
                        metadata: {
                            originalName: file.name,
                            isPreview: 'true',
                            extension: file.type,
                            creationDate: preferredDateIso,
                            dateSource: preferredDateSource
                        }
                    }).result, 120000, `preview upload for ${file.name}`);
                    previewUploaded = true;
                }

                if (displayBlob && displayPath) {
                    await withTimeout(uploadData({
                        path: displayPath,
                        data: displayBlob,
                        options: {
                            contentType: 'image/jpeg',
                        },
                        metadata: {
                            originalName: file.name,
                            isDisplay: 'true',
                            extension: 'image/jpeg',
                            creationDate: preferredDateIso,
                            dateSource: preferredDateSource
                        }
                    }).result, 180000, `display upload for ${file.name}`);
                    displayUploaded = true;
                }

                if (cancelRequestedRef.current) {
                    if (previewUploaded || displayUploaded) {
                        await cleanupPartialUpload(previewUploaded ? previewPath : null, null, displayUploaded ? displayPath : null);
                    }
                    registerOutcome({
                        index: idx,
                        status: 'canceled',
                        fileName: file.name,
                        reason: 'Cancelado por el usuario',
                    });
                    return { skipped: true, reason: 'canceled', name: file.name };
                }

                await withTimeout(uploadData({
                    path: finalPath,
                    data: file,
                    options: {
                        contentType: file.type || 'application/octet-stream',
                    },
                    metadata: {
                        originalName: file.name,
                        isPreview: 'false',
                        extension: file.type,
                        creationDate: preferredDateIso,
                        dateSource: preferredDateSource
                    }
                }).result, 300000, `final upload for ${file.name}`);

                console.log('File uploaded successfully:', file.name);
                registerOutcome({
                    index: idx,
                    status: 'done',
                    fileName: file.name,
                });
            } catch (error) {
                console.error('Error uploading file:', error);
                await cleanupPartialUpload(previewUploaded ? previewPath : null, finalPath, displayUploaded ? displayPath : null);
                registerOutcome({
                    index: idx,
                    status: 'error',
                    fileName: file.name,
                    reason: error?.message || 'Error al subir el archivo',
                });
                return { skipped: true, reason: 'error', name: file.name, error };
            }

            const [previewUrlResult, finalUrlResult] = await Promise.allSettled([
                previewToUpload ? withTimeout(getUrl({ path: previewPath }), 30000, `preview url for ${file.name}`) : Promise.resolve(null),
                withTimeout(getUrl({ path: finalPath }), 30000, `final url for ${file.name}`),
            ]);

            const previewUrl = previewUrlResult.status === 'fulfilled' && previewUrlResult.value?.url
                ? previewUrlResult.value.url.toString()
                : null;
            const finalUrl = finalUrlResult.status === 'fulfilled' && finalUrlResult.value?.url
                ? finalUrlResult.value.url.toString()
                : null;

            return {
                preview: {
                    key: previewPath,
                    url: previewUrl,
                },
                display: displayPath ? { key: displayPath } : null,
                definitivo: {
                    key: finalPath,
                    url: finalUrl,
                    name: file.name,
                    size: file.size,
                }
            };
        };

        const total = toUpload.length;
        for (let start = 0; start < total; start += safeBatchSize) {
            const batch = toUpload.slice(start, start + safeBatchSize);
            const batchNumber = Math.floor(start / safeBatchSize) + 1;
            setCurrentBatch({ current: batchNumber, total: totalBatches });

            if (cancelRequestedRef.current) {
                markRemainingFilesAsCanceled(batch, start);
                break;
            }

            console.log(`Starting upload batch ${batchNumber} (files ${start}..${Math.min(start + safeBatchSize - 1, total - 1)})`);

            const batchResults = await Promise.allSettled(
                batch.map((file, indexInBatch) => uploadSingle(file, start + indexInBatch))
            );

            batchResults.forEach((result) => {
                if (result.status === 'fulfilled' && result.value && !result.value.skipped) {
                    results.push(result.value);
                } else if (result.status === 'rejected') {
                    console.error('Batch item failed unexpectedly:', result.reason);
                }
            });

            console.log(`Finished upload batch ${batchNumber}`);

            if (cancelRequestedRef.current) {
                const nextStart = start + batch.length;
                markRemainingFilesAsCanceled(toUpload.slice(nextStart), nextStart);
                break;
            }
        }

        return results;
    };

    const createPreview = (file) => {
        const name = file.name.toLowerCase();

        if (/\.(jpg|jpeg|png|gif|bmp|webp|svg|heic|heif|avif)$/.test(name)) {
            return createPreviewImage(file);
        }

        if (/\.(mp4|mov|avi|mkv|webm|wmv)$/.test(name)) {
            return generateVideoThumbnails(file, 1);
        }

        if (/\.pdf$/.test(name)) {
            return createFileThumbnail(PdfLogo);
        }

        if (/\.(doc|docx)$/.test(name)) {
            return createFileThumbnail(WordLogo);
        }

        if (/\.(xls|xlsx|csv)$/.test(name)) {
            return createFileThumbnail(ExcelLogo);
        }

        if (/\.(ppt|pptx)$/.test(name)) {
            return createFileThumbnail(PowerPointLogo);
        }

        if (/\.(zip|rar|7z|tar|gz)$/.test(name)) {
            return createFileThumbnail(ZipLogo);
        }

        if (/\.(json|xml|yaml|yml|js|ts|java|py|html|css)$/.test(name)) {
            return createFileThumbnail(CodeLogo);
        }

        if (/\.(mp3|wav|aac|ogg)$/.test(name)) {
            return createFileThumbnail(AudioLogo);
        }

        return createFileThumbnail(FileLogo);
    };

    const createFileThumbnail = (Logo, maxSize = 400) =>
        new Promise((resolve) => {
            const img = new Image();
            img.src = Logo;

            img.onload = () => {
                const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
                const canvas = document.createElement('canvas');
                canvas.width = img.width * scale;
                canvas.height = img.height * scale;
                canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.8);
            };

            img.onerror = () => {
                console.warn('Failed to load file logo for thumbnail, skipping preview');
                resolve(null);
            };
        });

    const isHeicLikeFile = (file) => {
        const name = (file?.name || '').toLowerCase();
        const type = (file?.type || '').toLowerCase();
        return type === 'image/heic' || type === 'image/heif' || /\.hei[cf]$/.test(name);
    };

    const convertHeicToPreviewSource = async (file) => {
        const { default: heic2any } = await import('heic2any');
        const converted = await heic2any({
            blob: file,
            toType: 'image/jpeg',
            quality: 0.82,
        });

        if (Array.isArray(converted)) {
            return converted[0] || null;
        }

        return converted || null;
    };

    const renderImageBlobToJpeg = (sourceBlob, { maxSize = 400, quality = 0.25 } = {}) =>
        new Promise((resolve) => {
            const img = new Image();
            const objectUrl = URL.createObjectURL(sourceBlob);
            img.src = objectUrl;

            img.onload = () => {
                const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
                const canvas = document.createElement('canvas');
                canvas.width = Math.max(1, Math.round(img.width * scale));
                canvas.height = Math.max(1, Math.round(img.height * scale));
                canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                canvas.toBlob((blob) => {
                    URL.revokeObjectURL(objectUrl);
                    resolve(blob);
                }, 'image/jpeg', quality);
            };

            img.onerror = () => {
                URL.revokeObjectURL(objectUrl);
                resolve(null);
            };
        });

    const createPreviewImage = (file, maxSize = 400) =>
        new Promise((resolve) => {
            console.log('Generating createPreviewImage image for file:', file.name);
            const generate = async () => {
                let previewSource = file;

                try {
                    if (isHeicLikeFile(file)) {
                        const converted = await convertHeicToPreviewSource(file);
                        if (converted) {
                            previewSource = converted;
                        }
                    }
                } catch (error) {
                    console.warn('Failed to convert HEIC image for preview', file.name, error);
                }

                const blob = await renderImageBlobToJpeg(previewSource, { maxSize, quality: 0.25 });
                resolve(blob);
            };

            generate().catch((error) => {
                console.warn('Failed to generate image preview', file.name, error);
                resolve(null);
            });
        });

    const createDisplayImage = async (file) => {
        let displaySource = file;

        if (isHeicLikeFile(file)) {
            const converted = await convertHeicToPreviewSource(file);
            if (converted) {
                displaySource = converted;
            }
        }

        return renderImageBlobToJpeg(displaySource, { maxSize: 1600, quality: 0.55 });
    };

    const importFileandPreview = (file, revoke) => {
        return new Promise((resolve) => {
            window.URL = window.URL || window.webkitURL;
            const preview = window.URL.createObjectURL(file);
            if (revoke) {
                window.URL.revokeObjectURL(preview);
            }
            setTimeout(() => {
                resolve(preview);
            }, 100);
        });
    };

    const generateVideoThumbnails = async (videoFile, numberOfThumbnails) => {
        if (!videoFile.type?.includes('video')) {
            throw new Error('not a valid video file');
        }

        try {
            const duration = await withTimeout(getVideoDuration(videoFile), 15000, `video duration for ${videoFile.name}`);
            const safeDuration = Math.max(1, Math.floor(duration || 1));
            const safeCount = Math.max(1, Number(numberOfThumbnails) || 1);
            const fractions = Array.from({ length: safeCount }, (_, index) =>
                Math.min(safeDuration, Math.floor((index * safeDuration) / safeCount))
            );

            const thumbnailResults = await Promise.allSettled(
                fractions.map((time) => withTimeout(getVideoThumbnail(videoFile, time), 20000, `video thumbnail for ${videoFile.name} at ${time}s`))
            );

            return thumbnailResults
                .filter((result) => result.status === 'fulfilled' && result.value)
                .map((result) => result.value);
        } catch (error) {
            console.warn('Failed to generate video thumbnails for', videoFile.name, error);
            return [];
        }
    };

    const getVideoThumbnail = (file, videoTimeInSeconds) => {
        return new Promise((resolve, reject) => {
            if (!file.type.match('video')) {
                reject(new Error('file not valid'));
                return;
            }

            importFileandPreview(file).then((urlOfFile) => {
                const video = document.createElement('video');
                let resolved = false;

                const cleanup = () => {
                    video.removeEventListener('loadeddata', onLoadedData);
                    video.removeEventListener('seeked', onSeeked);
                    video.removeEventListener('error', onError);
                    try { video.pause(); } catch (error) { }
                    try { URL.revokeObjectURL(urlOfFile); } catch (error) { }
                };

                const finish = (value) => {
                    if (resolved) return;
                    resolved = true;
                    cleanup();
                    resolve(value);
                };

                const fail = (error) => {
                    if (resolved) return;
                    resolved = true;
                    cleanup();
                    reject(error);
                };

                const snapImage = (opts = {}) => {
                    const maxWidth = opts.maxWidth || 640;
                    const maxHeight = opts.maxHeight || 480;
                    const quality = typeof opts.quality === 'number' ? opts.quality : 0.5;
                    const canvas = document.createElement('canvas');
                    const vw = video.videoWidth || maxWidth;
                    const vh = video.videoHeight || maxHeight;
                    const scale = Math.min(1, maxWidth / vw, maxHeight / vh);
                    canvas.width = Math.max(1, Math.floor(vw * scale));
                    canvas.height = Math.max(1, Math.floor(vh * scale));
                    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
                    return canvas.toDataURL('image/jpeg', quality);
                };

                const onLoadedData = () => {
                    try {
                        const duration = Number.isFinite(video.duration) ? video.duration : 0;
                        const safeTime = Math.min(Math.max(videoTimeInSeconds, 0), duration > 0 ? Math.max(duration - 0.1, 0) : videoTimeInSeconds);
                        video.currentTime = safeTime;
                    } catch (error) {
                        fail(error);
                    }
                };

                const onSeeked = () => {
                    try {
                        finish(snapImage());
                    } catch (error) {
                        fail(error);
                    }
                };

                const onError = () => fail(new Error(`Failed to load video thumbnail for ${file.name}`));

                video.addEventListener('loadeddata', onLoadedData);
                video.addEventListener('seeked', onSeeked);
                video.addEventListener('error', onError);
                video.preload = 'metadata';
                video.src = urlOfFile;
                video.muted = true;
                video.playsInline = true;
            }).catch(reject);
        });
    };

    const getVideoDuration = (videoFile) => {
        return new Promise((resolve, reject) => {
            if (!videoFile) {
                reject(new Error('missing file'));
                return;
            }

            if (!videoFile.type.match('video')) {
                reject(new Error('file not valid'));
                return;
            }

            importFileandPreview(videoFile).then((url) => {
                const video = document.createElement('video');

                const cleanup = () => {
                    video.removeEventListener('loadedmetadata', onLoadedMetadata);
                    video.removeEventListener('error', onError);
                    try { video.pause(); } catch (error) { }
                    try { URL.revokeObjectURL(url); } catch (error) { }
                };

                const onLoadedMetadata = () => {
                    const duration = Number.isFinite(video.duration) ? video.duration : 0;
                    cleanup();
                    resolve(duration);
                };

                const onError = () => {
                    cleanup();
                    reject(new Error(`Failed to load video metadata for ${videoFile.name}`));
                };

                video.addEventListener('loadedmetadata', onLoadedMetadata);
                video.addEventListener('error', onError);
                video.preload = 'metadata';
                video.src = url;
                video.muted = true;
                video.playsInline = true;
            }).catch(reject);
        });
    };

    const handleUpload = async () => {
        if (files.length === 0 || isUploading) return;

        cancelRequestedRef.current = false;
        setCancelRequested(false);
        uploadStatusesRef.current = {};
        setFailedFiles([]);
        setCurrentBatch({ current: 0, total: Math.max(1, Math.ceil(files.length / Math.max(1, Number(batchSize) || 10))) });
        setUploadSummary({
            total: files.length,
            processed: 0,
            uploaded: 0,
            duplicates: 0,
            errors: 0,
            canceled: 0,
            finished: false,
            canceledByUser: false,
        });

        setIsUploading(true);
        try {
            if (typeof onUpload === 'function') {
                onUpload(files);
            }
            await uploadFiles(files);
        } finally {
            setIsUploading(false);
            setUploadSummary((prev) => ({
                ...prev,
                finished: true,
                canceledByUser: cancelRequestedRef.current,
            }));
        }
    };

    const handleCancelUpload = () => {
        if (!isUploading) return;
        cancelRequestedRef.current = true;
        setCancelRequested(true);
    };

    const totalSelectedSizeMb = (files.reduce((sum, file) => sum + (file.size || 0), 0) / (1024 * 1024)).toFixed(2);
    const progressPercent = uploadSummary.total > 0
        ? Math.round((uploadSummary.processed / uploadSummary.total) * 100)
        : 0;
    const shouldShowProgress = files.length > 0;
    const shouldShowBackButton = !isUploading && uploadSummary.finished;

    return (
        <div className="upload-page card">
            <p className="muted">Selecciona uno o varios archivos para subirlos.</p>

            <div className="upload-input-row">
                <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    onChange={handleFiles}
                    disabled={isUploading}
                />
            </div>

            {shouldShowProgress && (
                <div className="upload-progress-panel">
                    <div className="upload-progress-top">
                        <div>
                            <strong>{files.length}</strong> archivos seleccionados
                        </div>
                        <div>{totalSelectedSizeMb} MB</div>
                    </div>

                    <div className="upload-progress-top">
                        <div>
                            Progreso: <strong>{uploadSummary.processed}/{uploadSummary.total || files.length}</strong>
                        </div>
                        <div>{progressPercent}%</div>
                    </div>

                    <div className="upload-progress-bar">
                        <div
                            className="upload-progress-bar-fill"
                            style={{ width: `${progressPercent}%` }}
                        />
                    </div>

                    {(isUploading || uploadSummary.finished) && (
                        <div className="upload-progress-meta">
                            <span>Cargados: {uploadSummary.uploaded}</span>
                            <span>Duplicados: {uploadSummary.duplicates}</span>
                            <span>Errores: {uploadSummary.errors}</span>
                            <span>Cancelados: {uploadSummary.canceled}</span>
                        </div>
                    )}

                    {isUploading && (
                        <div className="upload-batch-indicator">
                            {cancelRequested
                                ? 'Cancelando al terminar el lote actual...'
                                : `Lote ${currentBatch.current || 1} de ${currentBatch.total || 1}`}
                        </div>
                    )}

                    {uploadSummary.finished && (
                        <div className="upload-finish-message">
                            {uploadSummary.canceledByUser
                                ? 'La carga fue cancelada.'
                                : 'La carga finalizo.'}
                        </div>
                    )}
                </div>
            )}

            {uploadSummary.finished && failedFiles.length > 0 && (
                <div className="upload-report">
                    <h4>Archivos no cargados</h4>
                    <ul>
                        {failedFiles.map((file, index) => (
                            <li key={`${file.name}-${index}`}>
                                <strong>{file.name}</strong>: {file.reason}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <div className="upload-actions" style={{ margin: 16, width: '100%' }}>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <button
                        className="btn-upload"
                        onClick={isUploading ? handleCancelUpload : handleUpload}
                        disabled={files.length === 0 || (isUploading && cancelRequested)}
                        style={{ width: 200 }}
                    >
                        {isUploading ? (cancelRequested ? 'Cancelando...' : 'Cancelar') : 'Subir'}
                    </button>
                    <button
                        className="btn-clear"
                        onClick={handleClearAll}
                        disabled={isUploading || files.length === 0}
                        style={{ width: 120 }}
                        title="Limpiar archivos seleccionados"
                    >
                        Limpiar
                    </button>
                    {shouldShowBackButton && (
                        <button
                            className="btn-clear"
                            onClick={() => {
                                if (typeof onBack === 'function') {
                                    onBack();
                                }
                            }}
                            style={{ width: 140 }}
                        >
                            Regresar
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default UploadPage;
