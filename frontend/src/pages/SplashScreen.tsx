import { useNavigate } from 'react-router-dom';
import OnboardingFlow from '../components/OnboardingFlow';

/** Backward-compatible route surface; onboarding now lives at app level. */
export default function SplashScreen() {
    const navigate = useNavigate();
    return <OnboardingFlow open onComplete={() => navigate('/map', { replace: true })} />;
}
