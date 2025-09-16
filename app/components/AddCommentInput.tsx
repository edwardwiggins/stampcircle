'use client';

import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { SlActionRedo, SlEmotsmile } from "react-icons/sl";
import Picker, { EmojiClickData } from 'emoji-picker-react';
import { FileUploaderRegular } from '@uploadcare/react-uploader';
import '@uploadcare/react-uploader/core.css';
import type { OutputFileEntry, OutputCollectionState } from '@uploadcare/react-uploader';
import { LocalUserProfile } from '@/app/lib/local-db';
import { db } from '@/app/lib/local-db';
import { useUser } from '@/app/context/user-context';

interface AddCommentInputProps {
    userProfile: LocalUserProfile | null;
    onAddComment: (commentContent: string, parentId: number | null, files: OutputFileEntry[]) => void;
    parentId?: number | null;
}

export default function AddCommentInput({ userProfile, onAddComment, parentId = null }: AddCommentInputProps) {
    const { isDbReady } = useUser();
    const [commentContent, setCommentContent] = useState('');
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [uploadedFiles, setUploadedFiles] = useState<OutputFileEntry[]>([]);
    
    const containerRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const defaultAvatar = '/default-avatar.jpg';
    
    if (!userProfile) {
        return null;
    }
    
    const avatarUrl = userProfile.profileImage || defaultAvatar;

    useEffect(() => {
        const textarea = textareaRef.current;
        if (textarea) {
            textarea.style.height = 'auto';
            textarea.style.height = `${textarea.scrollHeight}px`;
        }
    }, [commentContent]);
    
    const handleCommentSubmit = () => {
        if (commentContent.trim() || uploadedFiles.length > 0) {
            onAddComment(commentContent, parentId, uploadedFiles);
            const textarea = textareaRef.current;
            if (textarea) {
                textarea.style.height = 'auto';
            }
            setCommentContent('');
            setUploadedFiles([]);
            setShowEmojiPicker(false);
        }
    };
    
    const handleUploadChange = (data: OutputCollectionState) => {
        if (data.allEntries) {
            setUploadedFiles([...data.allEntries]);
        }
    };

    const handleRemoveFile = (uuid: string) => {
        setUploadedFiles(prevFiles => prevFiles.filter(file => file.uuid !== uuid));
    };

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setShowEmojiPicker(false);
            }
        }
        if (showEmojiPicker) {
            document.addEventListener("mousedown", handleClickOutside);
        }
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [showEmojiPicker]);

    const onEmojiClick = (emojiData: EmojiClickData) => {
        setCommentContent(prevContent => prevContent + emojiData.emoji);
    };

    return (
        <div className='add-comment-container'>
            <div className='uploader-regular-container'>
                <FileUploaderRegular
                    pubkey={process.env.NEXT_PUBLIC_UPLOADCARE_PUBLIC_KEY || ''}
                    multiple
                    imgOnly
                    sourceList='local, url, camera, gdrive'
                    onChange={handleUploadChange}
                    classNameUploader="uc-light"
                />
            </div>

            {uploadedFiles.length > 0 && (
                <div className="image-preview-container">
                    {/* **THE FIX**: We get the 'index' from the map function... */}
                    {uploadedFiles.map((file, index) => (
                        // ...and use it as a fallback key if file.uuid doesn't exist yet.
                        <div key={file.uuid || index} className="thumbnail">
                            {file.cdnUrl ? (
                                <Image
                                    src={`${file.cdnUrl}-/preview/100x100/`}
                                    alt={file.fileInfo?.originalFilename || 'preview'}
                                    width={60}
                                    height={60}
                                    className="thumbnail-image"
                                />
                            ) : (
                                <div className="thumbnail-loader"></div>
                            )}
                            <button onClick={() => handleRemoveFile(file.uuid)} className="remove-button">×</button>
                        </div>
                    ))}
                </div>
            )}

            <div className='add-comment'>
                <div className='comment-avatar'>
                    <Image className='comment-avatar' src={avatarUrl} alt="User Avatar" width={40} height={40} />
                </div>
                <div className='comment-textarea flex-1'>
                    <textarea 
                        ref={textareaRef}
                        placeholder="Write a comment..."
                        value={commentContent}
                        onChange={(e) => setCommentContent(e.target.value)}
                        rows={1}
                    />
                </div>
                <div ref={containerRef} className="relative flex items-center space-x-2 mt-[6px]">
                    <SlEmotsmile 
                        className='post-icon cursor-pointer' 
                        size={24} 
                        onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    />
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