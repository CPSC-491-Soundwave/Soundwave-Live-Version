import { readMetadata } from '../src/media/metadata.js';
import { fileURLToPath } from 'node:url';

const testFile = fileURLToPath(
    new URL('../../mediaFiles/test.mp3', import.meta.url)
);

const metadata = await readMetadata(testFile);

console.log(metadata);
