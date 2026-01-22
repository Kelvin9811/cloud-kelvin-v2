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
                                extension: file.type
                            }
                        }).result;
                    } else {
                        console.log('No preview to upload for', file.name);
                    }

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
            return generateVideoThumbnails(file,1);
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
                             console.log('res', res.slice(0,8))
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
                        var snapImage = function () {
                            var canvas = document.createElement("canvas");
                            canvas.width = video.videoWidth;
                            canvas.height = video.videoHeight;
                            canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
                            var image = canvas.toDataURL();
                            var success = image.length > 100000;
                            if (success) {
                                URL.revokeObjectURL(urlOfFIle);
                                resolve(image);
                            }
                            return success;
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
        const getVideoDuration = (videoFile)=> {
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
