
import { useState, useEffect } from 'react';
import { useDeviceId } from './useDeviceId';
import type { DeviceInfo } from '../types';

export function useDeviceInfo(): DeviceInfo {
    const deviceId = useDeviceId();
    const [deviceInfo, setDeviceInfo] = useState<DeviceInfo>(() => ({
        deviceId,
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        vendor: (navigator as any).vendor || undefined,
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
            const connection = (navigator as any).connection || 
                             (navigator as any).mozConnection || 
                             (navigator as any).webkitConnection;
            
            const info: DeviceInfo = {
                deviceId,
                userAgent: navigator.userAgent,
                platform: navigator.platform,
                vendor: (navigator as any).vendor || undefined,
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
                memory: (navigator as any).deviceMemory,
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
