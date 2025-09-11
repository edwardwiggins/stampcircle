// app/components/NewPostModal.tsx
'use client';

import React from 'react';
import NewPostForm from '@/app/NewPostForm';
import { useUser } from '@/app/context/user-context';
import Image from 'next/image';

interface NewPostModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function NewPostModal({ isOpen, onClose }: NewPostModalProps) {
    const { userProfile, loading } = useUser();

    if (!isOpen) {
        return null;
    }

    const defaultAvatarUrl = '/default-avatar.jpg';
    const avatarUrl = userProfile?.profileImage || defaultAvatarUrl;

    return (
        <div className='modal'>
            <div className='modal-content'>
                <div className="post-heading">
                    <Image
                      className='avatar'
                      src={avatarUrl}
                      alt="Avatar"
                      width={50}
                      height={50}
                    />
                    <div className='user-info'>
                      <span className='username'>{userProfile.displayName}</span>
                    </div>
                    <h2 className='text-xl font-bold'>Create a New Post</h2>
                </div>
                <NewPostForm
                    onClose={onClose}
                />
            </div>
        </div>
    );
}