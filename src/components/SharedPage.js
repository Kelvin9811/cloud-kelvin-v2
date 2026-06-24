import React, { useEffect, useState } from 'react';
import Galery from './Galery';
import './UploadPage.css';
import { getPublicOriginal, getPublicShare } from '../shareApi';

const PUBLIC_PAGE_SIZE = 24;

const SharedPage = ({ shareId }) => {
    const [images, setImages] = useState([]);
    const [folderName, setFolderName] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [nextToken, setNextToken] = useState(null);
    const [itemCount, setItemCount] = useState(0);

    useEffect(() => {
        let active = true;

        const loadInitialPage = async () => {
            setLoading(true);
            setError('');
            setImages([]);
            setNextToken(null);
            setItemCount(0);

            try {
                const payload = await getPublicShare(shareId, { pageSize: PUBLIC_PAGE_SIZE });
                if (!active) return;

                setFolderName(payload.folderName || '');
                setItemCount(payload.itemCount || 0);
                setNextToken(payload.nextToken || null);
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

        loadInitialPage();
        return () => {
            active = false;
        };
    }, [shareId]);

    const handleLoadMore = async () => {
        if (!nextToken || loadingMore) return;

        setLoadingMore(true);
        try {
            const payload = await getPublicShare(shareId, {
                pageSize: PUBLIC_PAGE_SIZE,
                nextToken,
            });

            setNextToken(payload.nextToken || null);
            setItemCount(payload.itemCount || 0);
            setImages((prev) => [
                ...prev,
                ...(payload.items || []).map((item) => ({
                    path: item.previewPath,
                    publicId: item.publicId,
                    title: item.originalName,
                    properties: { url: item.previewUrl },
                })),
            ]);
        } catch (shareError) {
            setError(shareError.message || 'No se pudo cargar mas archivos compartidos');
        } finally {
            setLoadingMore(false);
        }
    };

    const resolveOriginal = async (item) => {
        const payload = await getPublicOriginal(shareId, item.publicId);
        return payload.url;
    };

    if (loading) {
        return <div className="App"><div className="main-content"><p className="muted">Cargando carpeta compartida...</p></div></div>;
    }

    if (error && images.length === 0) {
        return <div className="App"><div className="main-content"><p style={{ color: 'red' }}>{error}</p></div></div>;
    }

    return (
        <div className="App">
            <div className="main-content">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 4 }}>
                    <span className="greeting">Carpeta compartida {folderName ? `- ${folderName}` : ''}</span>
                    <span className="muted" style={{ fontSize: '0.95rem' }}>
                        Mostrando {images.length} de {itemCount}
                    </span>
                </div>

                {error && images.length > 0 && (
                    <p style={{ color: 'red', textAlign: 'center', marginBottom: 0 }}>{error}</p>
                )}

                <Galery
                    images={images}
                    allowDelete={false}
                    resolveOriginal={resolveOriginal}
                    publicTitle="Vista compartida publica"
                />

                {(nextToken || loadingMore) && (
                    <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
                        <button
                            className="btn-clear"
                            onClick={handleLoadMore}
                            disabled={loadingMore}
                            style={{ minWidth: 160 }}
                        >
                            {loadingMore ? 'Cargando...' : 'Cargar mas'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SharedPage;
