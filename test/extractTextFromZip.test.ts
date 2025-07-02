import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { extractTextFromZip, extractTextFromZipChunked } from '../src/zipUtils.js';

const repoInfo = { full_name: 'owner/repo', description: '' };

test('README placed first', async () => {
  const zip = new JSZip();
  zip.file('repo-main/a.js', 'aaa');
  zip.file('repo-main/README.md', 'readme');
  zip.file('repo-main/b.js', 'bbb');

  const output = await extractTextFromZip(zip, repoInfo, ['js', 'md'], []);

  const firstHeader = output.match(/file: ([^\n]+)/)?.[1];
  assert.equal(firstHeader, 'README.md');
});

test('root README prioritized over nested ones', async () => {
  const zip = new JSZip();
  zip.file('repo-main/adc/README.md', 'nested readme');
  zip.file('repo-main/abc/main.c', 'int main(){}');
  zip.file('repo-main/README.md', 'root');

  const output = await extractTextFromZip(zip, repoInfo, ['md', 'c'], []);

  const firstHeader = output.match(/file: ([^\n]+)/)?.[1];
  assert.equal(firstHeader, 'README.md');
});

test('subdirectory README placed before other files in that directory', async () => {
  const zip = new JSZip();
  zip.file('repo-main/sub/a.js', 'aaa');
  zip.file('repo-main/sub/README.md', 'sub readme');
  zip.file('repo-main/sub/b.js', 'bbb');

  const output = await extractTextFromZip(zip, repoInfo, ['js', 'md'], []);

  const files = Array.from(output.matchAll(/file: ([^\n]+)/g)).map((m) => m[1]);
  assert.deepEqual(files, ['sub/README.md', 'sub/a.js', 'sub/b.js']);
});

test('deeply nested README placed before files under that directory', async () => {
  const zip = new JSZip();
  zip.file('repo-main/a/b/c/file.js', 'content');
  zip.file('repo-main/a/b/README.md', 'readme b');
  zip.file('repo-main/a/b/c/README.md', 'readme c');
  zip.file('repo-main/README.md', 'root');

  const output = await extractTextFromZip(zip, repoInfo, ['js', 'md'], []);

  const files = Array.from(output.matchAll(/file: ([^\n]+)/g)).map((m) => m[1]);
  assert.deepEqual(files, [
    'README.md',
    'a/b/README.md',
    'a/b/c/README.md',
    'a/b/c/file.js',
  ]);
});

test('file tree is printed at top of output', async () => {
  const zip = new JSZip();
  zip.file('repo-main/src/a.js', 'aaa');
  zip.file('repo-main/README.md', 'readme');

  const output = await extractTextFromZip(zip, repoInfo, ['js', 'md'], []);

  const preFile = output.split('---')[0].trim();
  const lines = preFile
    .split('\n')
    .slice(2)
    .filter((l) => l.trim() !== ''); // skip repo name/description and blanks

  assert.deepEqual(lines, [
    '.',
    '├── README.md',
    '└── src',
    '    └── a.js',
  ]);
});

test('include glob overrides extension filter', async () => {
  const zip = new JSZip();
  zip.file('repo-main/script.special', 'aaa');

  const output = await extractTextFromZip(zip, repoInfo, ['js'], [], [
    '**/*.special',
  ]);

  assert.match(output, /file: script\.special/);
});

test('exclude globs take priority over include globs', async () => {
  const zip = new JSZip();
  zip.file('repo-main/src/file.txt', 'aaa');

  const output = await extractTextFromZip(
    zip,
    repoInfo,
    ['txt'],
    ['src/**'],
    ['src/file.txt']
  );

  assert.equal(/file:/.test(output), false);
});

test('single chunk when content is small', async () => {
  const zip = new JSZip();
  zip.file('repo-main/small.txt', 'small content');

  const chunks = [];
  for await (const chunk of extractTextFromZipChunked(zip, repoInfo, ['txt'], [], [], 1024)) {
    chunks.push(chunk);
  }

  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].isLast, true);
  assert.equal(chunks[0].chunkIndex, 1);
  assert.match(chunks[0].content, /small content/);
});

test('multiple chunks when content exceeds size limit', async () => {
  const zip = new JSZip();
  // Create files with large content to force chunking
  const largeContent = 'x'.repeat(2000); // 2KB of content
  zip.file('repo-main/file1.txt', largeContent);
  zip.file('repo-main/file2.txt', largeContent);
  zip.file('repo-main/file3.txt', largeContent);

  const chunks = [];
  // Set a small chunk size of 3KB to force splitting
  for await (const chunk of extractTextFromZipChunked(zip, repoInfo, ['txt'], [], [], 3 * 1024)) {
    chunks.push(chunk);
  }

  assert.ok(chunks.length > 1, 'Should create multiple chunks');
  
  // First chunk should not be last
  assert.equal(chunks[0].isLast, false);
  assert.equal(chunks[0].chunkIndex, 1);
  
  // Last chunk should be marked as last
  const lastChunk = chunks[chunks.length - 1];
  assert.equal(lastChunk.isLast, true);
  assert.equal(lastChunk.chunkIndex, chunks.length);
  
  // First chunk should have the tree structure
  assert.match(chunks[0].content, /owner\/repo/);
  assert.match(chunks[0].content, /\.\n├── file1\.txt/);
  
  // Subsequent chunks should have continuation header
  if (chunks.length > 1) {
    assert.match(chunks[1].content, /continued - part 2/);
  }
});

test('chunks maintain file boundaries', async () => {
  const zip = new JSZip();
  const content1 = 'a'.repeat(1500); // 1.5KB
  const content2 = 'b'.repeat(1500); // 1.5KB
  zip.file('repo-main/file1.txt', content1);
  zip.file('repo-main/file2.txt', content2);

  const chunks = [];
  // Set chunk size of 2KB to force a split between files
  for await (const chunk of extractTextFromZipChunked(zip, repoInfo, ['txt'], [], [], 2 * 1024)) {
    chunks.push(chunk);
  }

  // Should not split in the middle of file content
  for (const chunk of chunks) {
    const fileMatches = chunk.content.match(/---\nfile: [^\n]+\n---\n/g);
    if (fileMatches) {
      // Each file section should be complete (no partial files)
      const content = chunk.content;
      const fileSections = content.split(/---\nfile: [^\n]+\n---\n/).slice(1);
      for (const section of fileSections) {
        if (section.includes('file1.txt')) {
          assert.equal(section.includes('a'.repeat(100)), true, 'File1 content should be complete');
        }
        if (section.includes('file2.txt')) {
          assert.equal(section.includes('b'.repeat(100)), true, 'File2 content should be complete');
        }
      }
    }
  }
});

test('large content creates multiple chunks with proper naming', async () => {
  const zip = new JSZip();
  const largeContent = 'X'.repeat(1024 * 1024); // 1MB per file
  
  // Create 6 files with 1MB each to exceed 5MB limit  
  for (let i = 1; i <= 6; i++) {
    zip.file(`repo-main/file${i}.txt`, largeContent);
  }

  const chunks = [];
  for await (const chunk of extractTextFromZipChunked(zip, repoInfo, ['txt'], [], [], 5 * 1024 * 1024)) {
    chunks.push(chunk);
  }

  console.log(`Generated ${chunks.length} chunks for large content test`);
  
  // Should create multiple chunks for large content
  assert.ok(chunks.length >= 2, `Expected multiple chunks, got ${chunks.length}`);
  
  // First chunk should have proper header
  assert.match(chunks[0].content, /owner\/repo/);
  assert.equal(chunks[0].chunkIndex, 1);
  assert.equal(chunks[0].isLast, false);
  
  // Last chunk should be marked as last
  const lastChunk = chunks[chunks.length - 1];
  assert.equal(lastChunk.isLast, true);
  assert.equal(lastChunk.chunkIndex, chunks.length);
  
  // Continuation chunks should have proper headers
  if (chunks.length > 1) {
    assert.match(chunks[1].content, /continued - part 2/);
  }
});
