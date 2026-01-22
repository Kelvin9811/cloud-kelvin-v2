import React, { useState } from 'react';
import './UploadPage.css';
import { uploadData, getUrl } from '@aws-amplify/storage';
import PdfLogo from '../images/pdf_logo.png';

const UploadPage = ({ onUpload, userId = '' }) => {
    const [files, setFiles] = useState([]);

    const handleFiles = (e) => {
        const list = Array.from(e.target.files || []);
        setFiles(list);
    };

    const handleUpload = async () => {

        if (typeof onUpload === 'function') {
            onUpload(files);
        }
        const uploadedFiles = await uploadFiles(files);


        setFiles([]);
    };

    // Sube los archivos a S3 y devuelve array de URLs
    const uploadFiles = async (files) => {

        if (!files || files.length === 0) return [];

        const uploads = await Promise.all(
            Array.from(files).map(async (file) => {

                const uuid = crypto.randomUUID();
                const cleanName = file.name.replace(/\s+/g, '_');

                // Rutas
                const previewPath = `uploads/users/${userId}/previews/${uuid}_${cleanName}`;
                const finalPath = `uploads/users/${userId}/original/${uuid}_${cleanName}`;

                let previewBlob = await createPreview(file);

                // Crear preview
                console.log('Creating preview for file:', file.name);

                try {
                    // Subir preview
                    console.log('Uploading file.type:', file.type);
                    await uploadData({
                        path: previewPath,
                        data: previewBlob,
                        options: {
                            contentType: 'image/jpeg',
                        },
                        metadata: {
                            originalName: file.name,
                            isPreview: 'true',
                            extension: file.type
                        }
                    }).result;

                    console.log('Uploading final file to path:', finalPath);

                    await uploadData({
                        path: finalPath,
                        data: file,
                        options: {
                            contentType: file.type || 'application/octet-stream',
                        },
                        metadata: {
                            originalName: file.name,
                            isPreview: 'false',
                            extension: file.type
                        }
                    }).result;

                    console.log('File uploaded successfully:', file.name);


                } catch (error) {
                    console.error('Error uploading file:', error);
                }

                const [{ url: previewUrl }, { url: finalUrl }] = await Promise.all([
                    getUrl({ path: previewPath }),
                    getUrl({ path: finalPath }),
                ]);

                return {
                    preview: {
                        key: previewPath,
                        url: previewUrl.toString(),
                    },
                    definitivo: {
                        key: finalPath,
                        url: finalUrl.toString(),
                        name: file.name,
                        size: file.size,
                    }
                };
            })
        );

        return uploads;
    };

    const createPreview = (file) => {
        if (file.name.match(/\.(jpg|jpeg|png|gif|bmp|webp)$/i)) {
            console.log('Creating image thumbnail for jpg|jpeg|png|gif|bmp|webp:', file.name);
            return createPreviewImage(file);
        } else if (file.name.match(/\.(mp4|mov|avi|mkv|webm|wmv)$/i)) {
            console.log('Creating video thumbnail for file mp4|mov|avi|mkv|webm|wmv:', file.name);
            return createVideoThumbnail(file);
        } else if (file.name.match(/\.pdf$/i)) {
            return createPdfThumbnail(file);
        } else {
            console.log('No preview created for file:', file.name);
        }
    };

    const createPdfThumbnail = (file, maxSize = 400) =>
        new Promise((resolve) => {
            // Use the bundled pdf logo as the preview for PDFs
            const img = new Image();
            img.src = PdfLogo;

            img.onload = () => {
                const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
                const canvas = document.createElement('canvas');
                canvas.width = img.width * scale;
                canvas.height = img.height * scale;
                canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.8);
            };

            // If the image fails to load, resolve with null so upload flow can skip
            img.onerror = () => {
                console.warn('Failed to load PDF logo for thumbnail, skipping preview');
                resolve(null);
            };
        });

    const createPreviewImage = (file, maxSize = 400) =>
        new Promise((resolve) => {
            console.log('Generating createPreviewImage image for file:', file.name);
            const img = new Image();
            img.src = URL.createObjectURL(file);

            img.onload = () => {
                const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);

                const canvas = document.createElement('canvas');
                canvas.width = img.width * scale;
                canvas.height = img.height * scale;

                canvas
                    .getContext('2d')
                    .drawImage(img, 0, 0, canvas.width, canvas.height);

                canvas.toBlob(
                    (blob) => resolve(blob),
                    'image/jpeg',
                    0.25 // compresión
                );
            };
        });

    const createVideoThumbnail = (file, seekTo = 0.1) =>
        new Promise((resolve, reject) => {
            console.log('Generating thumbnail for video file:', file.name);

            const objectUrl = URL.createObjectURL(file);
            const video = document.createElement('video');
            video.preload = 'metadata';
            video.src = objectUrl;
            video.muted = true;
            video.playsInline = true;

            let finished = false;
            let timeoutId = null;

            const cleanup = () => {
                if (timeoutId) clearTimeout(timeoutId);
                try { URL.revokeObjectURL(objectUrl); } catch (e) { }
                try {
                    video.pause();
                    video.removeAttribute('src');
                    video.load();
                } catch (e) { }
            };

            const handleError = (err) => {
                if (finished) return;
                finished = true;
                cleanup();
                reject(err || new Error('Failed to create video thumbnail'));
            };

            const drawFrameAndResolve = () => {
                try {
                    const canvas = document.createElement('canvas');
                    const vw = video.videoWidth || 320;
                    const vh = video.videoHeight || 180;
                    canvas.width = vw;
                    canvas.height = vh;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                    canvas.toBlob((blob) => {
                        if (finished) return;
                        finished = true;
                        cleanup();
                        if (blob) resolve(blob);
                        else reject(new Error('Canvas toBlob returned null'));
                    }, 'image/jpeg', 0.8);
                } catch (e) {
                    handleError(e);
                }
            };

            const onSeeked = () => {
                drawFrameAndResolve();
            };

            const onLoadedMetadata = () => {
                // Choose a safe time within duration
                const duration = isFinite(video.duration) ? video.duration : 0;
                const time = duration > 0 ? Math.min(seekTo, duration / 2) : seekTo;
                try {
                    // wait for seeked event after setting currentTime
                    video.addEventListener('seeked', onSeeked, { once: true });
                    // Some formats/browsers throw when setting currentTime too early; try/catch
                    video.currentTime = time;
                } catch (e) {
                    // fallback: try to draw when we can play
                    console.warn('seek failed, falling back to canplay approach', e);
                    video.addEventListener('canplay', () => drawFrameAndResolve(), { once: true });
                    try { video.play().then(() => video.pause()).catch(() => { }); } catch (_) { }
                }
            };

            // If loadedmetadata doesn't fire for a codec/format, loadeddata/canplay may
            video.addEventListener('loadedmetadata', onLoadedMetadata, { once: true });
            video.addEventListener('loadeddata', () => {
                // In some cases loadeddata means a frame is available already
                if (!finished) {
                    // try to draw immediately
                    drawFrameAndResolve();
                }
            }, { once: true });


            // Timeout fallback: if nothing fires, try to capture a frame or fail after 5s
            timeoutId = setTimeout(() => {
                if (finished) return;
                try {
                    if (video.readyState >= 2) {
                        drawFrameAndResolve();
                    } else {
                        handleError(new Error('Timed out waiting for video to be ready'));
                    }
                } catch (e) {
                    handleError(e);
                }
            }, 5000);

            // Kick loading
            try { video.load(); } catch (e) { }
        });


    return (
        <div className="upload-page card">
            <p className="muted">Selecciona uno o varios archivos para subirlos.</p>

            <div className="upload-input-row">
                <input type="file" multiple onChange={handleFiles} style={{ flex: 1, border: '1px solid var(--purple-200)', borderRadius: '8px' }} />
                <button className="btn-upload" onClick={handleUpload} disabled={files.length === 0} style={{ flex: 1 }}>
                    Subir
                </button>
            </div>

            {files.length > 0 && (
                <div className="upload-list">
                    <h4>Archivos seleccionados:</h4>
                    <ul>
                        {files.map((f, i) => <li key={i}>{f.name} ({Math.round(f.size / 1024)} KB)</li>)}
                    </ul>
                </div>
            )}
        </div>
    );
};

export default UploadPage;
