# GitHub Repo Single Text Exporter

This Chrome extension downloads the current GitHub repository as a ZIP file, extracts `.py`, `.go`, `.md`, and `.txt` files, and combines them into a single text file. If `README.md` exists it is placed first, followed by the remaining files in alphabetical order.

Click the extension icon while viewing a GitHub repository to download the text file. The repository is fetched from
`https://github.com/<owner>/<repo>/archive/refs/heads/main.zip`, and this URL is logged to the extension's service worker console.

## Building

The source is written in TypeScript and bundled with [esbuild](https://esbuild.github.io/). Run the following commands to build and package the extension:

```bash
npm install
npm run package
```

`npm run package` creates `extension.zip` containing the compiled background script and `manifest.json`. Load this ZIP (after extracting) as an unpacked extension in Chrome.
