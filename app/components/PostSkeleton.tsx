// app/components/PostSkeleton.tsx
'use client';

const PostSkeleton = () => {
    return (
        <div className="post-block animate-pulse">
            <div className="post-heading">
                <div className="avatar bg-gray-300 rounded-full w-[50px] h-[50px]"></div>
                <div className="user-info flex-1 ml-4">
                    <div className="h-4 bg-gray-300 rounded w-1/3 mb-2"></div>
                    <div className="h-3 bg-gray-300 rounded w-1/4"></div>
                </div>
            </div>
            <div className="post-content mt-4 space-y-2">
                <div className="h-4 bg-gray-300 rounded w-full"></div>
                <div className="h-4 bg-gray-300 rounded w-5/6"></div>
            </div>
            <div className="h-48 bg-gray-300 rounded-md mt-4"></div>
        </div>
    );
};

export default PostSkeleton;