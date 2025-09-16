/** @type {import('next').NextConfig} */
const withPWA = require('@ducanh2912/next-pwa').default({
  dest: 'public', // Destination directory for the service worker files
  register: true, // Automatically register the service worker
  skipWaiting: true, // Install new service worker as soon as it's available
  disable: process.env.NODE_ENV === 'development', // Disable PWA in development to avoid caching issues
});

const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'xfotoaervolaaiqrhgue.supabase.co',
        port: '',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'https',
        // **THE FIX**: Corrected the hostname and added a wildcard '**.'
        // to allow images from any Uploadcare project subdomain.
        hostname: '**.ucarecd.net',
        port: '',
        pathname: '/**',
      },
    ],
  },
};

// We only need this one export that includes the PWA configuration
export default withPWA(nextConfig);