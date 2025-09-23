'use client';

import { useState, useEffect, useRef } from 'react';
import { useUser } from './context/user-context';
import { createLocalPost, syncLocalPosts } from './lib/supabase-sync-utils';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './lib/local-db';
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
    
    const [uploadedFiles, setUploadedFiles] = useState<OutputFileEntry[]>([]);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    // --- NEW --- State to track tags suggested in this session
    const [sessionSuggestedTags, setSessionSuggestedTags] = useState<string[]>([]);

    useEffect(() => {
        const fetchInitialData = async () => {
            const { data: visData, error: visError } = await supabase.from('social_post_visibilityoptions').select('*').order('sort');
            if (visError) console.error('Failed to fetch visibility options:', visError);
            else if (visData) await db.social_post_visibilityoptions.bulkPut(visData);

            const { data: tagsData, error: tagsError } = await supabase.from('social_tags').select('*').eq('tag_status', 1).eq('is_category', 0);
            if (tagsError) console.error('Failed to fetch hashtags:', tagsError);
            else if (tagsData) await db.social_tags.bulkPut(tagsData);
        };
        fetchInitialData();
    }, []);

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
            .where('displayName').startsWithIgnoreCase(query)
            .or('username').startsWithIgnoreCase(query)
            .limit(10).toArray();
        callback(users.map(user => ({ id: user.username, display: user.displayName || user.username })));
    };

    const fetchHashtags = async (query: string, callback: (data: { id: string | number; display: string }[]) => void) => {
        if (!query) return;
        const tags = await db.social_tags
            .where('[tag_status+is_category]').equals([1, 0])
            .and(tag => tag.tag_name.toLowerCase().startsWith(query.toLowerCase()))
            .limit(5).toArray();

        const formattedTags = tags.map(tag => ({ id: tag.id, display: tag.tag_displayname }));

        const queryIsNewSuggestion = query.length > 2 && !tags.some(tag => tag.tag_name.toLowerCase() === query.toLowerCase());
        if (queryIsNewSuggestion) {
            formattedTags.push({
                id: `SUGGEST_NEW:${query}`,
                display: `Suggest #${query} as a new tag`
            });
        }
        callback(formattedTags);
    };
    
    const handleSuggestTag = (tagName: string) => {
        console.log(`User suggested new tag: ${tagName}`);
        // --- NEW --- Add the suggested tag to our session state
        setSessionSuggestedTags(prev => [...prev, tagName.toLowerCase()]);
        toast.success(`'#${tagName}' submitted for review. Thank you!`);
    };

    const validateHashtags = async (text: string): Promise<{ isValid: boolean; error?: string }> => {
        const plainTextRegex = /(?<!\S)#(\w+)/g;
        const bbCodeRegex = /#\[([^\]]+)\]\(([^)]+)\)/g;

        const bbCodeTags = new Set([...text.matchAll(bbCodeRegex)].map(m => m[1]));
        const plainTextTags = [...text.matchAll(plainTextRegex)].map(m => m[1]);

        for (const plainTag of plainTextTags) {
            if (bbCodeTags.has(`#${plainTag}`)) {
                continue;
            }

            const cleanTagName = plainTag.toLowerCase();
            
            // --- UPDATED --- Check if the tag was just suggested in this session
            if (sessionSuggestedTags.includes(cleanTagName)) {
                continue;
            }

            const existingTag = await db.social_tags
                .where('tag_name').equalsIgnoreCase(cleanTagName)
                .first();

            if (!existingTag) {
                return {
                    isValid: false,
                    error: `The tag '#${plainTag}' is not an approved tag. To suggest it, please use the autocomplete menu.`
                };
            }
        }
        return { isValid: true };
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        const hashtagValidation = await validateHashtags(content);
        if (!hashtagValidation.isValid) {
            setError(hashtagValidation.error!);
            toast.error(hashtagValidation.error!);
            return;
        }

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
                has_mentions: content.includes('@['),
                has_hashtags: content.includes('#[')
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
        <form onSubmit={handleSubmit} className='flex flex-col h-full'>
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
                onChange={(e, newValue, newPlainTextValue, mentions) => {
                    const lastMention = mentions[mentions.length - 1];
                    if (lastMention && typeof lastMention.id === 'string' && lastMention.id.startsWith('SUGGEST_NEW:')) {
                        const newTagName = lastMention.id.split(':')[1];
                        handleSuggestTag(newTagName);
                        const newContent = content.replace(`#[${lastMention.display}](${lastMention.id})`, `#${newTagName}`);
                        setContent(newContent);
                    } else {
                        setContent(newValue);
                    }
                }}
                placeholder="What's on your mind? Use @ to mention users and # to add tags."
                className="mentions-input"
                a11ySuggestionsListLabel={"Suggested users and hashtags"}
            >
                <Mention
                    trigger="@"
                    data={fetchUsers}
                    markup="@[__display__](__id__)"
                    displayTransform={(id, display) => `@${display}`}
                    className="mentions-mention"
                />
                <Mention
                    trigger="#"
                    data={fetchHashtags}
                    markup="#[__display__](__id__)"
                    displayTransform={(id, display) => display}
                    className="mentions-hashtag"
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

            <div className="flex items-center justify-between mt-auto pt-4">
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