// app/components/ProfileDropdown.tsx

'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { LocalUserProfile } from '@/app/lib/local-db';
import LogoutButton from './LogoutButton';

interface ProfileDropdownProps {
    userProfile: LocalUserProfile;
}

export default function ProfileDropdown({ userProfile }: ProfileDropdownProps) {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Handles closing the dropdown if the user clicks outside of it
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (isOpen && dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    if (!userProfile) return null;

    return (
        <div ref={dropdownRef} className="profile-dropdown-container">
            {/* The user's avatar, which acts as the button to open the menu */}
            <Image 
                className='avatar cursor-pointer'
                src={userProfile.profileImage || '/default-avatar.jpg'} 
                alt={`${userProfile.displayName || 'User'}'s Avatar`}
                width={60} 
                height={60}
                onClick={() => setIsOpen(!isOpen)}
            />

            {/* The dropdown menu, which only appears if isOpen is true */}
            {isOpen && (
                <div className="profile-dropdown-menu">
                    <Link href={`/profile/${userProfile.username}`}>My Profile</Link>
                    <LogoutButton className="logout-button-dropdown" />
                </div>
            )}
        </div>
    );
}