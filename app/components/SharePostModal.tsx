// app/components/SharePostModal.tsx

'use client';

import { useState } from 'react';
import { useUser } from '@/app/context/user-context';
import { LocalPost, db } from '@/app/lib/local-db';
import { createLocalPost, syncLocalPosts } from '@/app/lib/supabase-sync-utils';
import PostCard from './postCard';
import { MentionsInput, Mention } from 'react-mentions';
import toast from 'react-hot-toast';
import { trackEvent } from '@/app/lib/analytics';

interface SharePostModalProps {
    isOpen: boolean;
    onClose: () => void;
    postToShare: LocalPost;
}

export default function SharePostModal({ isOpen, onClose, postToShare }: SharePostModalProps) {
    const { userProfile } = useUser();
    const [comment, setComment] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const fetchUsers = async (query: string, callback: (data: { id: string; display: string }[]) => void) => {
        if (!query) return;
        const users = await db.userProfile.where('displayName').startsWithIgnoreCase(query).or('username').startsWithIgnoreCase(query).limit(10).toArray();
        const formattedUsers = users.map(user => ({ id: user.username, display: user.displayName || user.username }));
        callback(formattedUsers);
    };

    const handleShareSubmit = async () => {
        if (!userProfile) return;
        setSubmitting(true);

        try {
            // Create the new "share" post, linking it to the original via related_post_id
            await createLocalPost({
                author_id: userProfile.user_id,
                post_content: comment,
                related_post_id: postToShare.id,
                post_visibility: 1, 
                allow_comments: true,
            });

            trackEvent('post_shared', {
                parent_post_id: postToShare.id,
                author_id: userProfile.user_id,
                has_comment: comment.trim().length > 0,
            });

            // Increment the original post's share count locally
            await db.social_posts.where({ id: postToShare.id }).modify(post => {
                post.totalshares = (post.totalshares || 0) + 1;
            });

            // --- NEW --- Trigger a sync immediately, just like with new posts
            syncLocalPosts();
            
            toast.success('Post shared successfully!');
            setComment('');
            onClose();

        } catch (error) {
            console.error('Failed to share post:', error);
            toast.error('Failed to share post.');
        } finally {
            setSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="modal">
            <div className="modal-content">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold">Share Post</h2>
                    <button onClick={onClose} className="text-2xl">&times;</button>
                </div>

                <MentionsInput
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Add a comment... (optional)"
                    className="mentions-input"
                    a11ySuggestionsListLabel={"Suggested users for mention"}
                >
                    <Mention
                        trigger="@"
                        data={fetchUsers}
                        markup="@[__display__](__id__)"
                        displayTransform={(id, display) => `@${display}`}
                        className="mentions-mention"
                    />
                </MentionsInput>

                <div className="embedded-post-container">
                    <PostCard post={postToShare} userProfile={userProfile} showActions={false} />
                </div>

                <div className='flex justify-end mt-4'>
                    <button onClick={onClose} className="close-button">Cancel</button>
                    <button onClick={handleShareSubmit} disabled={submitting} className="submit-button">
                        {submitting ? 'Sharing...' : 'Post'}
                    </button>
                </div>
            </div>
        </div>
    );
}