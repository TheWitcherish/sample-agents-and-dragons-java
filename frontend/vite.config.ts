
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
// Forward /local-runtime/* to a Spring Boot (Java) or BedrockAgentCoreApp (Python)
// backend on localhost:8080. Both expose /invocations on the same port — flip backends
// mid-demo by stopping one and starting the other. The browser only sees a same-origin
// /local-runtime/invocations call, so Python's lack of CORS doesn't matter here.
// Override with LOCAL_BACKEND_URL=http://localhost:8081 npm run dev for non-default
// ports (e.g. when Python and Java both want to run side-by-side on the same machine).
const LOCAL_BACKEND_URL = process.env.LOCAL_BACKEND_URL ?? 'http://localhost:8080';

export default defineConfig({
  server: {
    proxy: {
      '/local-runtime': {
        target: LOCAL_BACKEND_URL,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/local-runtime/, ''),
      },
    },
  },
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
