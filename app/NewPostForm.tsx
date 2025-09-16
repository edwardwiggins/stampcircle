'use client';

import { useState, useEffect, useRef } from 'react';
import { useUser } from './context/user-context';
import { createLocalPost, syncLocalPosts } from './lib/supabase-sync-utils';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './lib/local-db';
import { createClientSupabaseClient } from './lib/client-supabase';
import { SlArrowDown } from "react-icons/sl";
import Image from 'next/image';

interface NewPostFormProps {
    onClose: () => void;
}

export default function NewPostForm({ onClose }: NewPostFormProps) {
    const { userProfile } = useUser();
    const [content, setContent] = useState('');
    const [visibilityId, setVisibilityId] = useState<number>(1);
    const [allowComments, setAllowComments] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const supabase = createClientSupabaseClient();
    
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const fetchVisibilityOptions = async () => {
            const { data, error } = await supabase.from('social_post_visibilityoptions').select('*').order('sort');
            if (error) {
                console.error('Failed to fetch visibility options:', error);
            } else if (data) {
                await db.social_post_visibilityoptions.bulkPut(data);
            }
        };
        fetchVisibilityOptions();
    }, [supabase]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsMenuOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    const visibilityOptions = useLiveQuery(
        () => db.social_post_visibilityoptions.orderBy('sort').toArray(),
        []
    );

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSubmitting(true);

        try {
            if (!content.trim() || !userProfile?.user_id || !visibilityId) {
                throw new Error('Missing content, user, or visibility selection.');
            }

            await createLocalPost({
                author_id: userProfile.user_id,
                post_content: content,
                post_visibility: visibilityId,
                allow_comments: allowComments,
            });
            
            syncLocalPosts();
            
            setContent('');
            onClose();
        } catch (err: any) {
            setError(err.message || 'Failed to create post.');
        } finally {
            setSubmitting(false);
        }
    };

    const selectedOption = visibilityOptions?.find(opt => opt.id === visibilityId);

    return (
        <form onSubmit={handleSubmit} className='flex flex-col'>
            
            <div className="relative mb-4" ref={menuRef}>
                <button 
                    type="button" 
                    className='visibility-button'
                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                >
                    <div className="flex items-center">
                        {selectedOption?.visibility_icon && (
                            <Image 
                                src={selectedOption.visibility_icon} 
                                alt={selectedOption.visible_to}
                                width={16}
                                height={16}
                                className="mr-[8px]"
                            />
                        )}
                        <span>{selectedOption ? selectedOption.visible_to : 'Select Visibility'}</span>
                    </div>
                    <SlArrowDown className='ml-[8px]' />
                </button>

                {isMenuOpen && (
                    <div className='visibility-dropdown'>
                        {visibilityOptions?.map(option => (
                            <div 
                                key={option.id}
                                className='visibility-item'
                                onClick={() => {
                                    setVisibilityId(option.id);
                                    setIsMenuOpen(false);
                                }}
                            >
                                {/* **THE FIX**: Added the Image component here for each item in the list. */}
                                {option.visibility_icon && (
                                    <Image 
                                        src={option.visibility_icon} 
                                        alt={option.visible_to}
                                        width={14}
                                        height={14}
                                        className="mr-[8px]"
                                    />
                                )}
                                <span>{option.visible_to}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <textarea
                className='w-full p-2 border rounded-lg mb-[8px] mt-[16px] text-lg'
                placeholder="What's on your mind?"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={4}
            />

            <div className="flex items-center mb-4">
                <input
                    type="checkbox"
                    id="allowComments"
                    checked={allowComments}
                    onChange={(e) => setAllowComments(e.target.checked)}
                    className="h-6 w-6 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="allowComments" className="ml-[8px] block text-sm text-gray-900">
                    Allow comments on this post
                </label>
            </div>

            {error && <p className='text-red-500 mb-4'>{error}</p>}
            <div className='flex justify-end'>
                <button
                    type='button'
                    onClick={onClose}
                    className="close-button"
                >
                    Cancel
                </button>
                <button
                    type='submit'
                    disabled={submitting || !content.trim()}
                    className='submit-button'
                >
                    {submitting ? 'Posting...' : 'Post'}
                </button>
            </div>
        </form>
    );
}