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

  const firstHeader = output.split('\n').slice(2).join('\n').match(/file: ([^\n]+)/)?.[1];
  assert.equal(firstHeader, 'README.md');
});

test('root README prioritized over nested ones', async () => {
  const zip = new JSZip();
  zip.file('repo-main/adc/README.md', 'nested readme');
  zip.file('repo-main/abc/main.c', 'int main(){}');
  zip.file('repo-main/README.md', 'root');

  const output = await extractTextFromZip(zip, repoInfo, ['md', 'c'], []);

  const firstHeader = output
    .split('\n')
    .slice(2)
    .join('\n')
    .match(/file: ([^\n]+)/)?.[1];
  assert.equal(firstHeader, 'README.md');
});
