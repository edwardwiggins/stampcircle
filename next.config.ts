/** @type {import('next').NextConfig} */
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
        hostname: 'ucarecdn.com',
        port: '',
        pathname: '/**', // This matches all paths on this host
      },
    ],
  },
};

module.exports = nextConfig;