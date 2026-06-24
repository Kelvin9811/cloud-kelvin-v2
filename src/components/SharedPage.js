import React, { useEffect, useState } from 'react';
import Galery from './Galery';
import { getPublicOriginal, getPublicShare } from '../shareApi';

const SharedPage = ({ shareId }) => {
    const [images, setImages] = useState([]);
    const [folderName, setFolderName] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let active = true;

        const loadShare = async () => {
            setLoading(true);
            setError('');
            try {
                const payload = await getPublicShare(shareId);
                if (!active) return;
                setFolderName(payload.folderName || '');
                setImages((payload.items || []).map((item) => ({
                    path: item.previewPath,
                    publicId: item.publicId,
                    title: item.originalName,
                    properties: { url: item.previewUrl },
                })));
            } catch (shareError) {
                if (!active) return;
                setError(shareError.message || 'No se pudo cargar la carpeta compartida');
            } finally {
                if (active) setLoading(false);
            }
        };

        loadShare();
        return () => {
            active = false;
        };
    }, [shareId]);

    const resolveOriginal = async (item) => {
        const payload = await getPublicOriginal(shareId, item.publicId);
        return payload.url;
    };

    if (loading) {
        return <div className="App"><div className="main-content"><p className="muted">Cargando carpeta compartida...</p></div></div>;
    }

    if (error) {
        return <div className="App"><div className="main-content"><p style={{ color: 'red' }}>{error}</p></div></div>;
    }

    return (
        <div className="App">
            <div className="main-content">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span className="greeting">Carpeta compartida {folderName ? `- ${folderName}` : ''}</span>
                </div>
                <Galery
                    images={images}
                    allowDelete={false}
                    resolveOriginal={resolveOriginal}
                    publicTitle="Vista compartida pública"
                />
            </div>
        </div>
    );
};

export default SharedPage;
