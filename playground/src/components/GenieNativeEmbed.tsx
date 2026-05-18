// playground/src/components/GenieNativeEmbed.tsx

import React from 'react';

export const GenieNativeEmbed: React.FC<{ url?: string, iframe?: string, workspaceUrl?: string, spaceId?: string }> = ({ url, iframe, workspaceUrl, spaceId }) => {
    
    const resolveSrc = () => {
        if (url) return url;
        if (iframe) {
            const srcMatch = iframe.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
            return (srcMatch?.[1] || iframe).trim().replace(/&amp;/g, "&");
        }
        if (workspaceUrl && spaceId) {
            return \\/embed/genie/space/\\;
        }
        return '';
    };

    const src = resolveSrc();

    if (!src) {
        return <div className="genie-embed-error">Missing Genie URL or iframe config.</div>;
    }

    return (
        <iframe 
            src={src} 
            className="native-genie-iframe"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            style={{ width: '100%', height: '100%', border: 'none' }}
        />
    );
};
