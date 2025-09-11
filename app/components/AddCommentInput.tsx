// app/components/AddCommentInput.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { SlActionRedo, SlEmotsmile } from "react-icons/sl";
import Picker, { EmojiClickData } from 'emoji-picker-react';
import { LocalUserProfile } from '@/app/lib/local-db';

// Import the onAddComment prop
interface AddCommentInputProps {
    userProfile: LocalUserProfile | null;
    onAddComment: (commentContent: string, parentId: number | null) => void;
    parentId?: number | null; // Accept parentId as a prop
}

export default function AddCommentInput({ userProfile, onAddComment, parentId = null }: AddCommentInputProps) {
    const [commentContent, setCommentContent] = useState('');
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const defaultAvatar = '/default-avatar.jpg';
    const avatarUrl = userProfile?.profileImage || defaultAvatar;

    // A function to handle comment submission
    const handleCommentSubmit = () => {
        if (commentContent.trim()) {
            onAddComment(commentContent, parentId); // Pass the parentId to the callback
            setCommentContent(''); // Clear the input field after submission
            setShowEmojiPicker(false);
        }
    };

    // useEffect to handle clicks outside the emoji picker
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            // If the click is outside the main container, close the picker
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setShowEmojiPicker(false);
            }
        }

        // Add the event listener when the picker is visible
        if (showEmojiPicker) {
            document.addEventListener("mousedown", handleClickOutside);
        }

        // Clean up the event listener when the component unmounts or the picker closes
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [showEmojiPicker]);

    const onEmojiClick = (emojiData: EmojiClickData) => {
        setCommentContent(prevContent => prevContent + emojiData.emoji);
        // To close the picker after selecting an emoji, uncomment the line below
        // setShowEmojiPicker(false);
    };

    return (
        <div className='add-comment flex-col'>
            <div className='flex items-center space-x-2'>
                <div className='comment-avatar'>
                    <Image className='comment-avatar' src={avatarUrl} alt="User Avatar" width={40} height={40} />
                </div>
                <div className='comment-textarea'>
                    <textarea 
                        placeholder="Write a comment..."
                        value={commentContent}
                        onChange={(e) => setCommentContent(e.target.value)}
                    />
                </div>
                
                {/* New wrapper for the emoji and post icons to handle positioning.
                    Note the `relative` class.
                */}
                <div ref={containerRef} className="relative flex items-center space-x-2">
                    <SlEmotsmile 
                        className='post-icon cursor-pointer' 
                        size={24} 
                        onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    />
                    {/* Add the onClick handler to the SlActionRedo icon */}
                    <SlActionRedo
                        className='post-icon cursor-pointer'
                        size={24}
                        onClick={handleCommentSubmit}
                    />
                    {showEmojiPicker && (
                        <div className="absolute top-8 right-0 z-10">
                            <Picker onEmojiClick={onEmojiClick} />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}