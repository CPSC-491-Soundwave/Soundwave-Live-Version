import { readMetadata } from './metadata.js';

const metadata = await readMetadata('./mediaFiles/doomTest.mp3');

console.log(metadata);
