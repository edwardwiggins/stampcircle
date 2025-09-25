// app/components/onboarding/OnboardingFlow.tsx
'use client';

import { useState } from 'react';
import { useUser } from '@/app/context/user-context';
import WelcomeStep from './WelcomeStep';
import ProfilePictureStep from './ProfilePictureStep';
import '@/app/styles/onboarding.css';

interface OnboardingFlowProps {
    onComplete: () => void;
}

const OnboardingFlow = ({ onComplete }: OnboardingFlowProps) => {
    const { userProfile } = useUser();
    const [currentStep, setCurrentStep] = useState(1);

    const renderStep = () => {
        switch (currentStep) {
            case 1:
                return <WelcomeStep userName={userProfile?.displayName || ''} onNext={() => setCurrentStep(2)} />;
            case 2:
                return <ProfilePictureStep onComplete={onComplete} />;
            default:
                onComplete();
                return null;
        }
    };

    if (!userProfile) return null;

    return (
        <div className="onboarding-overlay">
            <div className="onboarding-modal">
                {renderStep()}
            </div>
        </div>
    );
};

export default OnboardingFlow;