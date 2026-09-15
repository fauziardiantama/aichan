import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

function getAllJsFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      results = results.concat(getAllJsFiles(fullPath));
    } else if (file.endsWith('.js')) {
      results.push(fullPath);
    }
  }
  return results;
}

const srcDir = path.resolve('./src');
const jsFiles = getAllJsFiles(srcDir);
console.log(`Checking syntax for ${jsFiles.length} files...`);

for (const file of jsFiles) {
  execFileSync('node', ['--check', file], { stdio: 'inherit' });
  console.log('✓ ' + path.relative(srcDir, file));
}

console.log('--- ALL FILES HAVE VALID SYNTAX ---');
