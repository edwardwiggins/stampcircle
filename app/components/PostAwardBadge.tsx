// app/components/PostAwardBadge.tsx
'use client';

import Image from 'next/image';

interface PostAwardBadgeProps {
    award: string;
}

const PostAwardBadge = ({ award }: PostAwardBadgeProps) => {
    // This object maps an award name to its specific image and tooltip.
    const awardDetails = {
        community_gem: {
            imageUrl: '/images/awards/community-gem.png',
            alt: 'Community Gem Award',
            tooltip: 'Awarded for receiving 10+ Gem reactions'
        },
        community_favourite: {
            imageUrl: '/images/awards/community-favourite.png',
            alt: 'Community Favourite Award',
            tooltip: 'Awarded for receiving 25+ total reactions'
        },

        community_stunning: {
            imageUrl: '/images/awards/community-stunning.png',
            alt: 'Community Stunning Award',
            tooltip: 'Awarded for receiving 10+ Stunning reactions'
        },
        // You can add your other awards here
        // stunning_design: { ... }
    };

    const details = awardDetails[award as keyof typeof awardDetails];

    if (!details) {
        return null;
    }

    return (
        <div 
            data-tooltip-id="app-tooltip"
            data-tooltip-content={details.tooltip}
        >
            <Image
                src={details.imageUrl}
                alt={details.alt}
                width={40} // Adjust size as needed
                height={40}
            />
        </div>
    );
};

export default PostAwardBadge;