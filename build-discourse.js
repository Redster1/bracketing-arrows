// Build script for the Discourse Tree plugin
// This avoids conflicts with the existing Arrows plugin code

const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

// Create an output directory for the Discourse Tree plugin
const outputDir = path.join(__dirname, 'discourse-tree-plugin');
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
}

// Copy necessary files
fs.copyFileSync(
    path.join(__dirname, 'manifest.json'),
    path.join(outputDir, 'manifest.json')
);

fs.copyFileSync(
    path.join(__dirname, 'styles.css'),
    path.join(outputDir, 'styles.css')
);

// Build the plugin
esbuild.buildSync({
    entryPoints: ['src/main.ts'],
    bundle: true,
    external: [
        'obsidian',
        'electron',
        '@codemirror/autocomplete',
        '@codemirror/closebrackets',
        '@codemirror/collab',
        '@codemirror/commands',
        '@codemirror/comment',
        '@codemirror/fold',
        '@codemirror/gutter',
        '@codemirror/highlight',
        '@codemirror/history',
        '@codemirror/language',
        '@codemirror/lint',
        '@codemirror/matchbrackets',
        '@codemirror/panel',
        '@codemirror/rangeset',
        '@codemirror/rectangular-selection',
        '@codemirror/search',
        '@codemirror/state',
        '@codemirror/stream-parser',
        '@codemirror/text',
        '@codemirror/tooltip',
        '@codemirror/view'
    ],
    format: 'cjs',
    target: 'es2021',
    logLevel: "info",
    sourcemap: 'inline',
    treeShaking: true,
    outfile: path.join(outputDir, 'main.js')
});