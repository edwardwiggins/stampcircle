'use client';

import { useState, useEffect, useRef } from 'react';
import { useUser } from './context/user-context';
import { createLocalPost, syncLocalPosts } from './lib/supabase-sync-utils';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './lib/local-db';
// --- UPDATED --- Import the shared client instance directly
import supabase from './lib/client-supabase';
import { SlArrowDown } from "react-icons/sl";
import Image from 'next/image';
import { trackEvent } from './lib/analytics';
import { FileUploaderRegular } from '@uploadcare/react-uploader';
import '@uploadcare/react-uploader/core.css';
import type { OutputFileEntry, OutputCollectionState } from '@uploadcare/react-uploader';
import toast from 'react-hot-toast';
import { MentionsInput, Mention } from 'react-mentions';
import '@/app/styles/mentions-input.css';


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
    // --- REMOVED --- The line below is no longer needed as we import the client directly
    // const supabase = createClientSupabaseClient();
    
    const [uploadedFiles, setUploadedFiles] = useState<OutputFileEntry[]>([]);
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

    const handleUploadChange = (data: OutputCollectionState) => {
        setUploadedFiles(data.allEntries.filter(file => file.status === 'success'));
    };

    const handleRemoveFile = (uuid: string) => {
        setUploadedFiles(prevFiles => prevFiles.filter(file => file.uuid !== uuid));
    };

    const selectedOption = visibilityOptions?.find(opt => opt.id === visibilityId);

    const fetchUsers = async (query: string, callback: (data: { id: string; display: string }[]) => void) => {
        if (!query) return;
        const users = await db.userProfile
            .where('displayName')
            .startsWithIgnoreCase(query)
            .or('username')
            .startsWithIgnoreCase(query)
            .limit(10)
            .toArray();

        const formattedUsers = users.map(user => ({
            id: user.username,
            display: user.displayName || user.username,
        }));
        callback(formattedUsers);
    };


    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSubmitting(true);

        try {
            if (!content.trim() && uploadedFiles.length === 0) {
                throw new Error('Post must have content or at least one image.');
            }
            if (!userProfile?.user_id || !visibilityId) {
                throw new Error('Missing user or visibility selection.');
            }

            trackEvent('post_created', {
                visibility: selectedOption?.visible_to || 'Unknown',
                allow_comments: allowComments,
                has_images: uploadedFiles.length > 0,
                image_count: uploadedFiles.length,
                has_mentions: content.includes('@[') 
            });

            await createLocalPost({
                author_id: userProfile.user_id,
                post_content: content,
                post_visibility: visibilityId,
                allow_comments: allowComments,
            }, 
            uploadedFiles);
            
            syncLocalPosts();
            setContent('');
            setUploadedFiles([]);
            onClose();
            toast.success('Post submitted successfully.');
        } catch (err: any) {
            setError(err.message || 'Failed to create post.');
            toast.error(err.message || 'Failed to create post. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

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

            <MentionsInput
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="What's on your mind? Mention users with @"
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

            {uploadedFiles.length > 0 && (
                <div className="image-preview-container mb-4">
                    {uploadedFiles.map((file, index) => (
                        <div key={file.uuid || index} className="thumbnail">
                            <Image
                                src={`${file.cdnUrl}-/preview/100x100/`}
                                alt={file.fileInfo?.originalFilename || 'preview'}
                                width={60}
                                height={60}
                                className="thumbnail-image"
                            />
                            <button type="button" onClick={() => handleRemoveFile(file.uuid)} className="remove-button">×</button>
                        </div>
                    ))}
                </div>
            )}

            <div className="flex items-center justify-between mb-4">
                <div className="uploader-regular-container">
                    <FileUploaderRegular
                        pubkey={process.env.NEXT_PUBLIC_UPLOADCARE_PUBLIC_KEY || ''}
                        multiple
                        imgOnly
                        sourceList='local, url, camera, gdrive'
                        onChange={handleUploadChange}
                        classNameUploader="uc-light"
                    />
                </div>
                <div className="flex items-center">
                    <input
                        type="checkbox"
                        id="allowComments"
                        checked={allowComments}
                        onChange={(e) => setAllowComments(e.target.checked)}
                        className="h-6 w-6 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <label htmlFor="allowComments" className="ml-[8px] block text-sm text-gray-900">
                        Allow comments
                    </label>
                </div>
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
                    disabled={submitting || (!content.trim() && uploadedFiles.length === 0)}
                    className='submit-button'
                >
                    {submitting ? 'Posting...' : 'Post'}
                </button>
            </div>
        </form>
    );
}