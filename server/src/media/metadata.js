import { parseFile } from 'music-metadata';

export async function readMetadata(filePath) {
  try {
    const metadata = await parseFile(filePath);

    return {
      title: metadata.common.title,
      artist: metadata.common.artist,
      album: metadata.common.album,
      duration: metadata.format.duration
    };
  } catch (error) {
    console.error('Failed to read metadata:', error);
    throw error;
  }
}
