import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@spotter/core'],
  reactStrictMode: true,
};

export default config;
