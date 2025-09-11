// app/components/AddPostButton.tsx
'use client';

import { useState } from 'react';
import NewPostModal from './NewPostModal';
import { Post } from '@/app/lib/types';
import { useUser } from '@/app/context/user-context';

export default function AddPostButton() {
    const { userProfile } = useUser();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const handleCloseModal = () => setIsModalOpen(false);
    const defaultAvatar = '/default-avatar.jpg';
    const avatarSource = userProfile?.profileImage || defaultAvatar;

    return (
        <>
            <div
                className='create-post flex items-center p-4 bg-white rounded-lg shadow-md mb-4'
                onClick={() => setIsModalOpen(true)}
            >
                <img 
                    className='avatar rounded-full mr-4' 
                    src={avatarSource} 
                    alt="Avatar" 
                    width={50} 
                    height={50} 
                />
                <div className='fake-textarea'>
                    What's on your mind?
                </div>
            </div>

            <NewPostModal 
                isOpen={isModalOpen} 
                onClose={handleCloseModal} 
            />
        </>
    );
}