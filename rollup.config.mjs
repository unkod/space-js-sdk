import terser from '@rollup/plugin-terser';
import ts     from 'rollup-plugin-ts';

const isProduction = !process.env.ROLLUP_WATCH;

function basePlugins() {
    return [
        ts(),

        // minify if we're building for production
        // (aka. npm run build instead of npm run dev)
        isProduction && terser({
            keep_classnames: true,
            keep_fnames: true,
            output: {
                comments: false,
            },
        }),
    ]
}

export default [
    // ES bundle (the CoddySpace) client as default export + additional helper classes).
    {
        input: 'src/index.ts',
        output: [
            {
                file:      'dist/coddyspace.es.mjs',
                format:    'es',
                sourcemap: isProduction,
            },
        ],
        plugins: basePlugins(),
        watch: { clearScreen: false },
    },

    // ES bundle but with .js extension.
    //
    // This is needed mainly because of React Native not recognizing the mjs
    // extension by default.
    {
        input: 'src/index.ts',
        output: [
            {
                file:      'dist/coddyspace.es.js',
                format:    'es',
                sourcemap: isProduction,
            },
        ],
        plugins: basePlugins(),
        watch: { clearScreen: false },
    },

    // UMD bundle (only the CoddySpace client as default export).
    {
        input: 'src/Client.ts',
        output: [
            {
                name:      'CoddySpace',
                file:      'dist/coddyspace.umd.js',
                format:    'umd',
                exports:   'default',
                sourcemap: isProduction,
            },
        ],
        plugins: basePlugins(),
        watch: { clearScreen: false },
    },

    // CommonJS bundle (only the CoddySpace client as default export).
    {
        input: 'src/Client.ts',
        output: [
            {
                name:      'CoddySpace',
                file:      'dist/coddyspace.cjs.js',
                format:    'cjs',
                exports:   'default',
                sourcemap: isProduction,
            }
        ],
        plugins: basePlugins(),
        watch: { clearScreen: false },
    },
];
