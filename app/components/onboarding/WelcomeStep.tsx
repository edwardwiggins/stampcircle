// app/components/onboarding/WelcomeStep.tsx
'use client';

import { SlDirections } from "react-icons/sl";

interface WelcomeStepProps {
    userName: string;
    onNext: () => void;
}

const WelcomeStep = ({ userName, onNext }: WelcomeStepProps) => {
    return (
        <div className="text-center">
            <SlDirections size={60} className="mx-auto text-yellow-500 mb-6" />
            <h2 className="text-3xl font-bold text-gray-800 mb-2 mt-[16px]">Welcome to StampCircle, {userName}!</h2>
            <p className="text-gray-600 mb-8">We're excited to have you join our community of philately enthusiasts.</p>
            <button
                onClick={onNext}
                className="onboarding-button"
            >
                Get Started
            </button>
        </div>
    );
};

export default WelcomeStep;