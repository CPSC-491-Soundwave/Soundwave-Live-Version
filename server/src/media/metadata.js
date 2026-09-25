import { parseFile } from 'music-metadata';

export async function readMetadata(filePath) {
  try {
    const metadata = await parseFile(filePath);

    return {
      title: metadata.common.title ?? 'Unknown Title',
      artist: metadata.common.artist ?? 'Unknown Artist',
      album: metadata.common.album ?? 'Unknown Album',
      duration: metadata.format.duration ?? null
    };
  } catch (error) {
    console.error('Failed to read metadata:', error);
    throw error;
  }
}
