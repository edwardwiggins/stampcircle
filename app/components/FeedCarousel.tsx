// app/components/FeedCarousel.tsx
'use client';

import { LocalPost } from "@/app/lib/local-db";
import Image from "next/image";
import Link from "next/link";

interface FeedCarouselProps {
    title: string;
    items: LocalPost[];
}

// A smaller, compact card for use inside the carousel
const PostCard = ({ post }: { post: LocalPost }) => {
    // Attempt to find the first image from the post's content
    const firstImageUrl = post.images?.[0]?.cdnUrl || null;

    return (
        <Link href={`/post/${post.id}`} className="block w-40 flex-shrink-0">
            <div className="rounded-lg overflow-hidden shadow-md bg-white h-full">
                {firstImageUrl ? (
                    <div className="relative w-full h-24">
                        <Image 
                            src={`${firstImageUrl}-/preview/200x200/`} 
                            alt="Post image" 
                            layout="fill" 
                            className="object-cover" 
                        />
                    </div>
                ) : (
                    <div className="w-full h-24 bg-gray-200"></div>
                )}
                <div className="p-2">
                    <p className="text-sm font-semibold text-gray-800 truncate">{post.post_content || 'View Post'}</p>
                    <p className="text-xs text-gray-500 mt-1">View Post &rarr;</p>
                </div>
            </div>
        </Link>
    );
};

const FeedCarousel = ({ title, items }: FeedCarouselProps) => {
    if (!items || items.length === 0) {
        return null;
    }

    return (
        <div className="my-6">
            <h2 className="text-lg font-bold text-gray-800 mb-3 px-4">{title}</h2>
            <div className="flex gap-4 overflow-x-auto pb-4 px-4">
                {items.map(post => (
                    <PostCard key={post.id} post={post} />
                ))}
            </div>
        </div>
    );
};

export default FeedCarousel;