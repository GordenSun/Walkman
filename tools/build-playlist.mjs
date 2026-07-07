#!/usr/bin/env node
// 扫描 music/ 目录下的音频文件，自动生成 playlist.json
// 用法：node tools/build-playlist.mjs
import { readdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const musicDir = join(root, 'music');
const out = join(musicDir, 'playlist.json');

const exts = /\.(mp3|m4a|wav|ogg|flac|aac)$/i;

// 保留旧 playlist 中手工设置的标题
let oldTitles = {};
if (existsSync(out)) {
  try {
    const old = JSON.parse(readFileSync(out, 'utf8'));
    for (const t of old.tracks || []) oldTitles[t.file] = t.title;
  } catch {}
}

const files = readdirSync(musicDir)
  .filter((f) => exts.test(f))
  .sort((a, b) => a.localeCompare(b, 'zh'));

const prettify = (name) =>
  name
    .replace(exts, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const playlist = {
  name: "MIXTAPE '26",
  tracks: files.map((f) => ({ title: oldTitles[f] || prettify(f), file: f })),
};

writeFileSync(out, JSON.stringify(playlist, null, 2) + '\n');
console.log(`playlist.json 已生成，共 ${files.length} 首曲目：`);
for (const t of playlist.tracks) console.log(`  · ${t.title}  (${t.file})`);
