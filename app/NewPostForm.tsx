// app/NewPostForm.tsx
'use client';

import { useState } from 'react';
import { useUser } from './context/user-context';
import { createLocalPost } from './lib/supabase-sync-utils';

interface NewPostFormProps {
    onClose: () => void;
}

export default function NewPostForm({ onClose }: NewPostFormProps) {
    const { userProfile } = useUser();
    const [content, setContent] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSubmitting(true);

        try {
            if (!content.trim() || !userProfile?.user_id) {
                throw new Error('Post content or user information is missing.');
            }

            // Call the offline-first function
            await createLocalPost({
                author_id: userProfile.user_id,
                post_content: content,
                post_visibility: 1,
                post_type: 'User',
                totalreactions: 0,
                totalcomments: 0,
                totalshares: 0,
            });
            
            setContent(''); // Clear the text area
            onClose(); // Close the modal
        } catch (err: any) {
            setError(err.message || 'Failed to create post.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className='flex flex-col'>
            <textarea
                className='w-full p-2 border rounded-lg mb-4'
                placeholder="What's on your mind?"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={4}
            />
            {error && <p className='text-red-500 mb-4'>{error}</p>}
            <div className='flex justify-end'>
                <button
                    type='button'
                    onClick={onClose}
                    className='bg-gray-200 text-gray-800 px-4 py-2 rounded-lg mr-2'
                >
                    Cancel
                </button>
                <button
                    type='submit'
                    disabled={submitting || !content.trim()}
                    className='bg-blue-500 text-white px-4 py-2 rounded-lg disabled:opacity-50'
                >
                    {submitting ? 'Posting...' : 'Post'}
                </button>
            </div>
        </form>
    );
}