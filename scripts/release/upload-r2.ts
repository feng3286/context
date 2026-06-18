import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { S3mini } from 's3mini';
import { findBlockmaps, findInstallers, findManifests } from './lib/artifacts.ts';
import { r2Endpoint } from './lib/config.ts';
import { fail, info, step, warn } from './lib/log.ts';

const r2AccessKeyId = process.env.R2_ACCESS_KEY_ID;
const r2SecretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const r2AccountId = process.env.R2_ACCOUNT_ID;
const r2Bucket = process.env.R2_BUCKET;

if (!r2AccessKeyId || !r2SecretAccessKey || !r2AccountId || !r2Bucket) {
  warn(
    'R2 secrets not configured (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET). Skipping R2 upload.'
  );
  process.exit(0);
}

const s3 = new S3mini({
  accessKeyId: r2AccessKeyId,
  secretAccessKey: r2SecretAccessKey,
  endpoint: r2Endpoint(),
  region: 'auto',
});

const files = [...findManifests(), ...findInstallers(), ...findBlockmaps()];

if (files.length === 0) {
  fail('No artifacts found to upload');
}

step(`Uploading ${files.length} artifact(s) to R2`);

for (const file of files) {
  const key = basename(file);
  const contentType = key.endsWith('.yml') ? 'application/yaml' : 'application/octet-stream';
  const data = readFileSync(file);
  info(`Uploading ${key} (${(data.length / 1024 / 1024).toFixed(1)} MB)`);
  await s3.putObject(key, new Uint8Array(data), contentType);
  info(`Uploaded ${key}`);
}

info('All artifacts uploaded to R2');
