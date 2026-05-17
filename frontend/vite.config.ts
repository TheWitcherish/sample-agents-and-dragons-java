
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({ registerType: 'autoUpdate' })
  ],
  build: {
    // Enable source maps for better debugging
    sourcemap: true,
    // Optimize chunk splitting for better caching
    rollupOptions: {
      external: [
        // Externalize Node.js modules that shouldn't be bundled for browser
        'crypto',
        'fs',
        'path',
        'os',
        'node:url',
        'node:fs',
        'fs/promises',
        'child_process',
        'https',
        'module',
        'assert',
        'util',
        'url',
        'net',
        'stream',
        'zlib',
        // Externalize AWS backend modules
        'aws-cdk-lib',
        '@aws-amplify/backend',
        '@aws-amplify/backend-function',
        '@aws-amplify/backend-data',
        '@aws-amplify/backend-auth',
        '@aws-amplify/backend-storage',
        '@aws-amplify/platform-core',
        '@aws-amplify/client-config',
        '@aws-amplify/graphql-generator',
        '@aws-amplify/model-generator',
        '@aws-amplify/graphql-types-generator',
        '@aws-amplify/graphql-api-construct'
      ],
      output: {
        manualChunks: {
          // Separate vendor chunks for better caching
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'aws-vendor': ['aws-amplify', '@aws-amplify/ui-react', '@aws-sdk/client-lambda'],
          'dnd-vendor': ['react-dnd', 'react-dnd-html5-backend'],
        },
      },
    },
    // Set chunk size warning limit
    chunkSizeWarningLimit: 1000,
  },
  // Optimize dependencies
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      'aws-amplify',
      '@aws-amplify/ui-react',
      '@aws-sdk/client-lambda',
    ],
    exclude: [
      'aws-cdk-lib',
      '@aws-amplify/backend',
      '@aws-amplify/backend-function',
      '@aws-amplify/backend-data',
      '@aws-amplify/backend-auth',
      '@aws-amplify/backend-storage',
      '@aws-amplify/platform-core',
      '@aws-amplify/client-config',
      '@aws-amplify/graphql-generator',
      '@aws-amplify/model-generator',
      '@aws-amplify/graphql-types-generator',
      '@aws-amplify/graphql-api-construct'
    ]
  },
})
