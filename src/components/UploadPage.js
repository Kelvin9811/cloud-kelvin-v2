import React, { useState } from 'react';
import './UploadPage.css';
import { uploadData, getUrl } from '@aws-amplify/storage';
import PdfLogo from '../images/pdf_logo.png';

const UploadPage = ({ onUpload, userId = '', currentFolder = '' }) => {
    const [files, setFiles] = useState([]);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadStatuses, setUploadStatuses] = useState({}); // index -> 'idle' | 'uploading' | 'done' | 'error'
    // Tamaño del lote para uploads concurrentes (ajustable desde la UI)
    const [batchSize, setBatchSize] = useState(10);

    const handleFiles = (e) => {
        const list = Array.from(e.target.files || []);
        setFiles(list);
    };

    // Trunca el nombre para mostrar en UI a un máximo de n caracteres (con ...)
    const truncateName = (name, max = 40) => {
        if (!name) return '';
        if (name.length <= max) return name;
        return name.slice(0, max - 3) + '...';
    };

    const handleUpload = async () => {

        if (files.length === 0) return;

        setIsUploading(true);
        try {
            if (typeof onUpload === 'function') {
                onUpload(files);
            }
            const uploadedFiles = await uploadFiles(files);

            // You might want to do something with uploadedFiles here
        } finally {
            setIsUploading(false);
            // NOTE: do not clear selected files here — keep them visible until the user leaves the screen
            // setFiles([]);
        }
    };

    const handleClearAll = () => {
        // Reiniciar todo el estado relacionado con la carga para empezar de nuevo
        console.log('Clearing selected files and upload statuses');
        setFiles([]);
        setUploadStatuses({});
        setIsUploading(false);
    };

    // Formatea la fecha del archivo para usar en el nombre: YYYYMMDD_HHMMSS
    const formatFileDate = (ts) => {
        const d = new Date(ts || Date.now());
        const pad = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    };

    // Sube los archivos a S3 y devuelve array de URLs (en batches secuenciales)
    const uploadFiles = async (files) => {

        if (!files || files.length === 0) return [];

        const results = [];
        const toUpload = Array.from(files);
        const safeBatchSize = Math.max(1, Number(batchSize) || 10);

        const uploadSingle = async (file, idx) => {
            // mark this file as uploading
            setUploadStatuses((s) => ({ ...s, [idx]: 'uploading' }));

            const uuid = crypto.randomUUID();
            const cleanName = file.name.replace(/\s+/g, '_');
            const fileDateToken = formatFileDate(file.lastModified || Date.now());

            // Rutas (si currentFolder está definido, subir dentro de esa carpeta)
            const basePath = currentFolder ? `uploads/users/${userId}/${currentFolder}` : `uploads/users/${userId}`;
            // Anteponer la fecha del archivo antes del uuid
            const previewPath = `${basePath}/previews/${fileDateToken}_${uuid}_${cleanName}`;
            const finalPath = `${basePath}/original/${fileDateToken}_${uuid}_${cleanName}`;

            // Logs para depuración: ruta final y nombre generado
            console.log(`Prepared upload for file="${file.name}" finalName="${fileDateToken}_${uuid}_${cleanName}"`);
            console.log('Upload paths -> preview:', previewPath, ' final:', finalPath);

            let previewBlob = await createPreview(file);
            console.log('Preview raw for file', file.name, ':', previewBlob);

            // Si la miniatura viene como base64 (string) o array de base64, convertir a Blob
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

            // If generateVideoThumbnails returned an array (of dataURLs), pick first
            let previewToUpload = previewBlob;
            if (Array.isArray(previewBlob) && previewBlob.length > 0) {
                previewToUpload = previewBlob[0];
            }
            // If it's a string and looks like a data URL, convert to Blob
            if (typeof previewToUpload === 'string' && previewToUpload.startsWith('data:')) {
                try {
                    previewToUpload = dataURLtoBlob(previewToUpload);
                } catch (e) {
                    console.warn('Failed to convert dataURL to Blob for preview, will skip preview upload', e);
                    previewToUpload = null;
                }
            }

            console.log('Preview ready for upload for file:', file.name, previewToUpload);

            try {
                // Subir preview
                console.log('Uploading file.type:', file.type);
                if (previewToUpload) {
                    await uploadData({
                        path: previewPath,
                        data: previewToUpload,
                        options: {
                            contentType: 'image/jpeg',
                        },
                        metadata: {
                            originalName: file.name,
                            isPreview: 'true',
                            extension: file.type,
                            creationDate: new Date(file.lastModified || Date.now()).toISOString()
                        }
                    }).result;
                } else {
                    console.log('No preview to upload for', file.name);
                }

                console.log('Uploading final file to path:', finalPath);
                console.log('Final metadata creationDate:', new Date(file.lastModified || Date.now()).toISOString());

                await uploadData({
                    path: finalPath,
                    data: file,
                    options: {
                        contentType: file.type || 'application/octet-stream',
                    },
                    metadata: {
                        originalName: file.name,
                        isPreview: 'false',
                        extension: file.type,
                        creationDate: new Date(file.lastModified || Date.now()).toISOString()
                    }
                }).result;

                console.log('File uploaded successfully:', file.name);

                // mark as done on success
                setUploadStatuses((s) => ({ ...s, [idx]: 'done' }));
            } catch (error) {
                console.error('Error uploading file:', error);
                setUploadStatuses((s) => ({ ...s, [idx]: 'error' }));
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
        };

        const total = toUpload.length;
        for (let start = 0; start < total; start += safeBatchSize) {
            const batch = toUpload.slice(start, start + safeBatchSize);
            console.log(`Starting upload batch ${Math.floor(start / safeBatchSize) + 1} (files ${start}..${Math.min(start + safeBatchSize - 1, total - 1)})`);

            // Ejecutar el batch en paralelo (máx safeBatchSize) y esperar a que termine
            const batchResults = await Promise.all(
                batch.map((file, indexInBatch) => uploadSingle(file, start + indexInBatch))
            );

            results.push(...batchResults);
            console.log(`Finished upload batch ${Math.floor(start / safeBatchSize) + 1}`);
        }

        return results;
    };

    const createPreview = (file) => {
        if (file.name.match(/\.(jpg|jpeg|png|gif|bmp|webp)$/i)) {
            console.log('Creating image thumbnail for jpg|jpeg|png|gif|bmp|webp:', file.name);
            return createPreviewImage(file);
        } else if (file.name.match(/\.(mp4|mov|avi|mkv|webm|wmv)$/i)) {
            console.log('Creating video thumbnail for file mp4|mov|avi|mkv|webm|wmv:', file.name);
            return generateVideoThumbnails(file, 1);
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

    // convert image to object part instead of base64 for better performance
    // https://developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL
    const importFileandPreview = (file, revoke) => {
        return new Promise((resolve, reject) => {
            window.URL = window.URL || window.webkitURL;
            let preview = window.URL.createObjectURL(file);
            // remove reference
            if (revoke) {
                window.URL.revokeObjectURL(preview);
            }
            setTimeout(() => {
                resolve(preview);
            }, 100);
        });
    }


    const generateVideoThumbnails = async (videoFile, numberOfThumbnails) => {

        let thumbnail = [];
        let fractions = [];

        return new Promise(async (resolve, reject) => {
            if (!videoFile.type?.includes("video")) reject("not a valid video file");
            await getVideoDuration(videoFile).then(async (duration) => {
                // divide the video timing into particular timestamps in respective to number of thumbnails
                // ex if time is 10 and numOfthumbnails is 4 then result will be -> 0, 2.5, 5, 7.5 ,10
                // we will use this timestamp to take snapshots
                for (let i = 0; i <= duration; i += duration / numberOfThumbnails) {
                    fractions.push(Math.floor(i));
                }
                // the array of promises
                let promiseArray = fractions.map((time) => {
                    return getVideoThumbnail(videoFile, time)
                })
                console.log('promiseArray', promiseArray)
                console.log('duration', duration)
                console.log('fractions', fractions)
                await Promise.all(promiseArray).then((res) => {
                    res.forEach((res) => {
                        console.log('res', res.slice(0, 8))
                        thumbnail.push(res);
                    });
                    console.log('thumbnail', thumbnail)
                    resolve(thumbnail);
                }).catch((err) => {
                    console.error(err)
                }).finally((res) => {
                    console.log(res);
                    resolve(thumbnail);
                })
            });
            reject("something went wront");
        });
    };

    const getVideoThumbnail = (file, videoTimeInSeconds) => {
        return new Promise((resolve, reject) => {
            if (file.type.match("video")) {
                importFileandPreview(file).then((urlOfFIle) => {
                    var video = document.createElement("video");
                    var timeupdate = function () {
                        if (snapImage()) {
                            video.removeEventListener("timeupdate", timeupdate);
                            video.pause();
                        }
                    };
                    video.addEventListener("loadeddata", function () {
                        if (snapImage()) {
                            video.removeEventListener("timeupdate", timeupdate);
                        }
                    });
                    var snapImage = function (opts = {}) {
                        const maxWidth = opts.maxWidth || 640;
                        const maxHeight = opts.maxHeight || 480;
                        const quality = typeof opts.quality === 'number' ? opts.quality : 0.5; // JPEG quality 0..1

                        var canvas = document.createElement("canvas");
                        const vw = video.videoWidth || maxWidth;
                        const vh = video.videoHeight || maxHeight;
                        // calculate scale to fit within maxWidth/maxHeight
                        const scale = Math.min(1, maxWidth / vw, maxHeight / vh);
                        canvas.width = Math.max(1, Math.floor(vw * scale));
                        canvas.height = Math.max(1, Math.floor(vh * scale));
                        canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
                        // compress to JPEG to save space
                        var image = canvas.toDataURL('image/jpeg', quality);
                        // Always resolve with the generated thumbnail (even if small)
                        try { URL.revokeObjectURL(urlOfFIle); } catch (e) { }
                        resolve(image);
                        return true;
                    };
                    video.addEventListener("timeupdate", timeupdate);
                    video.preload = "metadata";
                    video.src = urlOfFIle;
                    // Load video in Safari / IE11
                    video.muted = true;
                    video.playsInline = true;
                    video.currentTime = videoTimeInSeconds;
                    video.play();
                });
            } else {
                reject("file not valid");
            }
        });
    };

    /**
     *
     * @param videoFile {File}
     * @returns {number} the duration of video in seconds
     */
    const getVideoDuration = (videoFile) => {
        return new Promise((resolve, reject) => {
            if (videoFile) {
                if (videoFile.type.match("video")) {
                    importFileandPreview(videoFile).then((url) => {
                        let video = document.createElement("video");
                        video.addEventListener("loadeddata", function () {
                            resolve(video.duration);
                        });
                        video.preload = "metadata";
                        video.src = url;
                        // Load video in Safari / IE11
                        video.muted = true;
                        video.playsInline = true;
                        video.play();
                        //  window.URL.revokeObjectURL(url);
                    });
                }
            } else {
                reject(0);
            }
        });
    };

    return (
        <div className="upload-page card">
            <p className="muted">Selecciona uno o varios archivos para subirlos.</p>

            <div className="upload-input-row">
                <input type="file" multiple onChange={handleFiles} />

            </div>

            {files.length > 0 && (
                <div className="upload-list">
                    <h4>Archivos seleccionados:</h4>
                    <ul style={{ listStyleType: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {files.map((f, i) => {
                            const status = uploadStatuses[i] || 'idle';
                            let icon = '';
                            if (status === 'uploading') icon = '⏳';
                            else if (status === 'done') icon = '✅';
                            else if (status === 'error') icon = '❌';
                            const display = truncateName(f.name, 20);
                            return (
                                <li key={i} style={{ alignContent: 'center', gap: 8, width: '100%' }} title={f.name}>
                                    <span style={{ width: 'auto' }}>{display} ({Math.round(f.size / 1024)} KB)</span>
                                    <span style={{ width: 20 }}>{icon}</span>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
            <div className="upload-actions" style={{ margin: 16 , width: '100%'}}>
                <div style={{ display: 'flex', gap: 12 }}>
                    <button className="btn-upload" onClick={handleUpload} disabled={files.length === 0 || isUploading} style={{ width: 200 }}>
                        Subir
                    </button>
                    <button className="btn-clear" onClick={handleClearAll} disabled={files.length === 0 || isUploading} style={{ width: 120 }} title="Limpiar archivos seleccionados">
                        Limpiar
                    </button>
                </div>
            </div>
        </div>
    );
};

export default UploadPage;
