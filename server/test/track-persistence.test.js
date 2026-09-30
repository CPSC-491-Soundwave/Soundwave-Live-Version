import test from 'node:test';
import assert from 'node:assert/strict';
import { createCatalogRepository } from '../src/data/catalog.repository.js';

test('findTrackById returns the persisted minimal track row', async () => {
    const expectedTrack = {
        track_id: 3005,
        track_title: 'Soundwave Test Track',
        duration_ms: 123000,
        media_path: 'mediaFiles/test.mp3',
        album_id: 2003,
        album_title: 'Soundwave Test Album',
        artist_id: 1003,
        artist_name: 'Soundwave Test Artist'
    };

    const database = {
        async query(sql, params) {
            assert.match(sql, /WHERE t\.id = \$1/);
            assert.deepEqual(params, [3005]);

            return {
                rows: [expectedTrack]
            };
        }
    };

    const repository = createCatalogRepository(database);

    const track = await repository.findTrackById(3005);

    assert.deepEqual(track, expectedTrack);
});

test('findTrackById returns null when the track does not exist', async () => {
    const database = {
        async query() {
            return {
                rows: []
            };
        }
    };

    const repository = createCatalogRepository(database);

    const track = await repository.findTrackById(999999);

    assert.equal(track, null);
});
