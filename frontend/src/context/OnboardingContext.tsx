/* eslint-disable react-refresh/only-export-components */
import type { ReactNode } from 'react';
import { createContext, useContext } from 'react';

interface OnboardingContextValue {
    replay: () => void;
}

const OnboardingContext = createContext<OnboardingContextValue>({ replay: () => undefined });

export function OnboardingProvider({ children, value }: { children: ReactNode; value: OnboardingContextValue }) {
    return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding() {
    return useContext(OnboardingContext);
}
