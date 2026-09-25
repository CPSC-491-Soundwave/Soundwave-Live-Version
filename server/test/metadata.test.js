import { readMetadata } from '../src/media/metadata.js';

const metadata = await readMetadata('./mediaFiles/test.mp3');

console.log(metadata);
