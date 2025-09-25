// app/components/onboarding/ProfilePictureStep.tsx
'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useUser } from '@/app/context/user-context';
import { db } from '@/app/lib/local-db';
import supabase from '@/app/lib/client-supabase';
import toast from 'react-hot-toast';
import { FileUploaderRegular } from '@uploadcare/react-uploader';
import type { OutputFileEntry } from '@uploadcare/react-uploader';

interface ProfilePictureStepProps {
    onComplete: () => void;
}

const ProfilePictureStep = ({ onComplete }: ProfilePictureStepProps) => {
    const { userProfile, refreshUserProfile } = useUser();
    const [previewUrl, setPreviewUrl] = useState<string | null>(userProfile?.profileImage || userProfile?.default_profileImage || null);
    const [uploadedFile, setUploadedFile] = useState<OutputFileEntry | null>(null);
    const [isUploading, setIsUploading] = useState(false);

    const handleUploadChange = (files: OutputFileEntry[]) => {
        // --- DEBUGGING CHECKPOINT 1 ---
        console.log('Uploadcare returned files:', files);

        const file = files[0];
        if (file && file.cdnUrl) {
            // --- DEBUGGING CHECKPOINT 2 ---
            console.log('File successfully processed. CDN URL:', file.cdnUrl);
            setUploadedFile(file);
            setPreviewUrl(file.cdnUrl);
        } else {
            // --- DEBUGGING CHECKPOINT 3 ---
            console.log('File object was invalid or did not have a cdnUrl.');
        }
    };

    const handleSave = async () => {
        // --- DEBUGGING CHECKPOINT 4 ---
        console.log('Save button clicked. Current uploadedFile state:', uploadedFile);

        if (!uploadedFile || !userProfile) {
            if (!uploadedFile) {
                // --- DEBUGGING CHECKPOINT 5 ---
                console.log('Save clicked, but no file has been uploaded. Skipping.');
                toast.error("Please upload an image before saving.");
            }
            onComplete();
            return;
        }

        setIsUploading(true);
        toast.loading('Saving profile picture...');
        
        try {
            const newImageUrl = uploadedFile.cdnUrl;
            
            // --- DEBUGGING CHECKPOINT 6 ---
            console.log(`Attempting to update user ${userProfile.user_id} with image URL: ${newImageUrl}`);

            const { error } = await supabase
                .from('user_profile')
                .update({ profileImage: newImageUrl })
                .eq('user_id', userProfile.user_id);
            
            if (error) throw error;
            
            // --- DEBUGGING CHECKPOINT 7 ---
            console.log('Supabase updated successfully. Refreshing user profile...');

            await refreshUserProfile();

            toast.dismiss();
            toast.success('Profile picture updated!');
            onComplete();

        } catch (error) {
            // --- DEBUGGING CHECKPOINT 8 ---
            console.error("Failed to save profile picture:", error);
            toast.dismiss();
            toast.error("Could not save profile picture.");
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="text-center">
            <h2 className="text-3xl font-bold text-gray-800 mb-4">Add a Profile Picture</h2>
            <p className="text-gray-600 mb-6">Help others recognize you on StampCircle. You can always change this later.</p>

            {previewUrl && (
                <Image
                    src={previewUrl}
                    alt="Profile preview"
                    width={128}
                    height={128}
                    className="rounded-full mx-auto mb-6 object-cover h-32 w-32 border-4 border-white shadow-lg"
                />
            )}

            <div className="uploader-container mb-8">
                <FileUploaderRegular
                    pubkey={process.env.NEXT_PUBLIC_UPLOADCARE_PUBLIC_KEY || ''}
                    onChange={(data) => handleUploadChange(data.allEntries.filter(f => f.status === 'success'))}
                    imgOnly
                    sourceList='local, url, camera'
                    classNameUploader="uc-light"
                />
            </div>
            
            <div className="flex justify-between items-center">
                <button onClick={onComplete} className="onboarding-button-secondary">
                    Skip for Now
                </button>
                <button onClick={handleSave} className="onboarding-button" disabled={isUploading}>
                    {isUploading ? 'Saving...' : 'Save and Continue'}
                </button>
            </div>
        </div>
    );
};

export default ProfilePictureStep;