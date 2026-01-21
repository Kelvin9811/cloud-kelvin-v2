import React, { useState } from 'react';
import './UploadPage.css';
import { uploadData, getUrl } from '@aws-amplify/storage';

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
                const previewPath = `uploads/users/${userId}/previews/${uuid}.jpg`;
                const finalPath = `uploads/users/${userId}/definitivos/${uuid}_${cleanName}`;

                // Crear preview
                const previewBlob = await createPreviewImage(file);

                try {
                    // Subir preview
                    await uploadData({
                        path: previewPath,
                        data: previewBlob,
                        options: {
                            contentType: 'image/jpeg',
                        },
                    }).result;

                    // Subir definitivo (archivo original)
                    await uploadData({
                        path: finalPath,
                        data: file,
                        options: {
                            contentType: file.type || 'application/octet-stream',
                        },
                    }).result;



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

    const createPreviewImage = (file, maxSize = 400) =>
        new Promise((resolve) => {
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

    return (
        <div className="upload-page card">
            <p className="muted">Selecciona uno o varios archivos para subirlos.</p>

            <div className="upload-input-row">
                <input type="file" multiple onChange={handleFiles} />
                <button className="btn-upload" onClick={handleUpload} disabled={files.length === 0}>
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
