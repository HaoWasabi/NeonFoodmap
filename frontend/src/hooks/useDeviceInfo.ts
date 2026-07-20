
import { useState, useEffect } from 'react';
import { useDeviceId } from './useDeviceId';
import type { DeviceInfo } from '../types';

// Extended navigator interface for non-standard properties
interface NavigatorExtended extends Navigator {
    connection?: { type?: string; effectiveType?: string };
    mozConnection?: { type?: string; effectiveType?: string };
    webkitConnection?: { type?: string; effectiveType?: string };
    deviceMemory?: number;
}

export function useDeviceInfo(): DeviceInfo {
    const deviceId = useDeviceId();
    const nav = navigator as NavigatorExtended;
    const [deviceInfo, setDeviceInfo] = useState<DeviceInfo>(() => ({
        deviceId,
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        vendor: nav.vendor || undefined,
        language: navigator.language,
        languages: Array.from(navigator.languages),
        cookieEnabled: navigator.cookieEnabled,
        onLine: navigator.onLine,
        screenResolution: `${screen.width}x${screen.height}`,
        colorDepth: screen.colorDepth,
        pixelDepth: screen.pixelDepth,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        connectionType: undefined,
        effectiveType: undefined,
        memory: undefined,
        hardwareConcurrency: undefined,
    }));

    useEffect(() => {
        const updateDeviceInfo = () => {
            const navExt = navigator as NavigatorExtended;
            const connection = navExt.connection || 
                             navExt.mozConnection || 
                             navExt.webkitConnection;
            
            const info: DeviceInfo = {
                deviceId,
                userAgent: navigator.userAgent,
                platform: navigator.platform,
                vendor: navExt.vendor || undefined,
                language: navigator.language,
                languages: Array.from(navigator.languages),
                cookieEnabled: navigator.cookieEnabled,
                onLine: navigator.onLine,
                screenResolution: `${screen.width}x${screen.height}`,
                colorDepth: screen.colorDepth,
                pixelDepth: screen.pixelDepth,
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                connectionType: connection?.type,
                effectiveType: connection?.effectiveType,
                memory: navExt.deviceMemory,
                hardwareConcurrency: navigator.hardwareConcurrency,
            };
            
            setDeviceInfo(info);
        };

        updateDeviceInfo();

        const handleOnline = () => updateDeviceInfo();
        const handleOffline = () => updateDeviceInfo();
        
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, [deviceId]);

    return deviceInfo;
}
