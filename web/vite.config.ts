import adapter from '@sveltejs/adapter-auto';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { mdsvex } from 'mdsvex';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import rehypeExternalLinks from 'rehype-external-links';
import rehypeUnwrapImages from 'rehype-unwrap-images';
import { escapeSvelte } from 'mdsvex';
import { getSingletonHighlighter } from 'shiki';
import dracula from 'shiki/themes/dracula.mjs';
import { defineConfig } from 'vite';

// Get the Fabric base URL from environment variable with fallback
const FABRIC_BASE_URL = process.env.FABRIC_BASE_URL || 'http://localhost:8080';

// Initialize Shiki highlighter
const initializeHighlighter = async () => {
  try {
    return await getSingletonHighlighter({
      themes: ['dracula'],
      // "powershell" is necessary for the code example in about/README.md.
      // Shiki gives an error and shows plain text if a language is not here.
      langs: [
        'javascript',
        'typescript',
        'svelte',
        'markdown',
        'bash',
        'go',
        'text',
        'python',
        'rust',
        'c',
        'c++',
        'shell',
        'ruby',
        'json',
        'html',
        'css',
        'java',
        'sql',
        'toml',
        'yaml',
        'powershell'
      ]
    });
  } catch (error) {
    console.error('Failed to initialize Shiki highlighter:', error);
    return null;
  }
};

const shikiHighlighterPromise = initializeHighlighter();

/** @type {import('mdsvex').MdsvexOptions} */
const mdsvexOptions = {
  extensions: ['.md', '.svx'],
  smartypants: {
    quotes: true,
    ellipses: true,
    backticks: true,
    dashes: true
  },
  highlight: {
    highlighter: async (code: string, lang: string) => {
      try {
        const highlighter = await shikiHighlighterPromise;
        if (!highlighter) {
          console.warn('Shiki highlighter not available, falling back to plain text');
          return `<pre><code>${code}</code></pre>`;
        }
        const html = escapeSvelte(highlighter.codeToHtml(code, { lang, theme: dracula }));
        return `{@html \`${html}\`}`;
      } catch (error) {
        console.error('Failed to highlight code:', error);
        return `<pre><code>${code}</code></pre>`;
      }
    }
  },
  rehypePlugins: [
    rehypeSlug,
    rehypeUnwrapImages,
    [rehypeAutolinkHeadings, { behavior: 'wrap' }],
    [
      rehypeExternalLinks,
      {
        target: '_blank',
        rel: ['nofollow', 'noopener', 'noreferrer']
      }
    ]
  ]
};

// CAUTION: Lightning CSS minifies the CSS, and it refuses a pseudo-class that
// comes after a pseudo-element. Do not use a Tailwind class that puts the two
// in that order, such as `file:disabled:opacity-50`, because Lightning CSS
// stops the build on the `::file-selector-button:disabled` selector that the
// class produces. See https://github.com/parcel-bundler/lightningcss/issues/1292
// The Skeleton 2 Tailwind plugin made that selector on its own, and Skeleton 5
// does not, so the project no longer needs a different minifier.

export default defineConfig({
  // Tailwind 4 gives a Vite plugin, which replaces the PostCSS setup. It must
  // come before sveltekit() so that it can process the styles in components.
  plugins: [
    tailwindcss(),
    // SvelteKit 3 reads its configuration here; svelte.config.js is no longer
    // used by the kit plugin (config_file_unsupported).
    sveltekit({
      extensions: ['.svelte', '.md', '.svx'],
      // adapter-auto probes the deployment platform; it takes no options (the
      // pages/assets/fallback options that used to be passed here were inert).
      adapter: adapter(),
      prerender: {
        handleHttpError: ({ path, referrer, message }) => {
          // Log the error for debugging
          console.warn(
            `HTTP error during prerendering: ${message}\nPath: ${path}\nReferrer: ${referrer}`
          );

          // ignore 404 for specific case
          if (path === '/not-found' && referrer === '/') {
            return;
          }

          // otherwise fail
          throw new Error(message);
        }
      },
      preprocess: [
        vitePreprocess({
          script: true
        }),
        mdsvex(mdsvexOptions as unknown as Parameters<typeof mdsvex>[0])
      ]
    })
  ],
  define: {
    'process.env': {
      NODE_ENV: JSON.stringify(process.env.NODE_ENV)
    },
    'process.platform': JSON.stringify(process.platform),
    'process.cwd': JSON.stringify('/'),
    'process.browser': true,
    process: {
      cwd: () => '/'
    },
    // Inject Fabric configuration for client-side access
    __FABRIC_CONFIG__: {
      FABRIC_BASE_URL: JSON.stringify(FABRIC_BASE_URL)
    }
  },
  resolve: {
    alias: {
      process: 'process/browser'
    }
  },
  server: {
    fs: {
      allow: ['..'] // allows importing from the parent directory
    },
    proxy: {
      '/api': {
        target: FABRIC_BASE_URL,
        changeOrigin: true,
        timeout: 900000,
        rewrite: (path) => path.replace(/^\/api/, ''),
        configure: (proxy) => {
          proxy.on('error', (err, req, res) => {
            console.log('proxy error', err);
            (res as import('http').ServerResponse).writeHead(500, {
              'Content-Type': 'text/plain'
            });
            res.end('Something went wrong. The backend server may not be running.');
          });
        }
      },
      '^/(patterns|models|sessions)/names': {
        target: FABRIC_BASE_URL,
        changeOrigin: true,
        timeout: 900000,
        configure: (proxy) => {
          proxy.on('error', (err, req, res) => {
            console.log('proxy error', err);
            (res as import('http').ServerResponse).writeHead(500, {
              'Content-Type': 'application/json'
            });
            res.end(JSON.stringify({ error: 'Backend server not running', names: [] }));
          });
        }
      }
    },
    watch: {
      usePolling: true,
      interval: 100,
      ignored: ['**/node_modules/**', '**/dist/**', '**/.git/**', '**/.svelte-kit/**']
    }
  },
  build: {
    commonjsOptions: {
      transformMixedEsModules: true
    },
    target: 'esnext',
    minify: true,
    rollupOptions: {
      output: {
        format: 'es'
      }
    }
  }
});
