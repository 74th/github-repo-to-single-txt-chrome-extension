import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { extractTextFromZip } from '../src/zipUtils.js';

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
