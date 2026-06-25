import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';

interface PageTransitionProps {
    children: ReactNode;
}

export default function PageTransition({ children }: PageTransitionProps) {
    const location = useLocation();
    const [displayKey, setDisplayKey] = useState(location.key);
    const [isVisible, setIsVisible] = useState(true);

    useEffect(() => {
        if (location.key !== displayKey) {
            setIsVisible(false);
            const timeout = setTimeout(() => {
                setDisplayKey(location.key);
                setIsVisible(true);
            }, 150);
            return () => clearTimeout(timeout);
        }
    }, [location.key, displayKey]);

    return (
        <div
            className={`transition-opacity duration-150 ${isVisible ? 'opacity-100' : 'opacity-0'}`}
        >
            {children}
        </div>
    );
}
