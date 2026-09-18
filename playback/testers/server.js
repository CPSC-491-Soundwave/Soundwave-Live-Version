import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 4000;
const CHUNK_SIZE = 1024 * 1024; // 1 MiB

// Temporary Sprint 1 track lookup.
// TODO: Replace with database-backed catalog lookup later.
const tracks = {
  1: {
    path: path.join(__dirname, "mediaFiles", "test.mp3"),
  },
};

/**
 * Send a plain-text HTTP error response.
 */
function sendTextResponse(res, statusCode, message) {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain",
  });

  res.end(message);
}

/**
 * Send a 416 Range Not Satisfiable response.
 */
function sendInvalidRange(res, fileSize) {
  res.writeHead(416, {
    "Content-Range": `bytes */${fileSize}`,
  });

  res.end();
}

/**
 * Parse a single HTTP byte range.
 *
 * Supported:
 *   bytes=0-999
 *   bytes=1000-
 *
 * Not currently supported:
 *   bytes=-500
 *   bytes=0-99,200-299
 *
 * Returns:
 *   { start, end }
 *
 * or null if the range is invalid.
 */
function parseRange(rangeHeader, fileSize) {
  const match = /^bytes=(\d+)-(\d*)$/.exec(rangeHeader);

  if (!match) {
    return null;
  }

  const start = Number(match[1]);

  if (start >= fileSize) {
    return null;
  }

  let end;

  // Client supplied an explicit end:
  // bytes=1000-2000
  if (match[2]) {
    end = Number(match[2]);

    if (end < start) {
      return null;
    }

    end = Math.min(end, fileSize - 1);
  } else {
    // Open-ended range:
    // bytes=1000-
    //
    // Cap the response to one chunk.
    end = Math.min(
      start + CHUNK_SIZE - 1,
      fileSize - 1
    );
  }

  return {
    start,
    end,
  };
}

/**
 * Stream a track to the client.
 */
function streamTrack(req, res, trackId) {
  const track = tracks[trackId];

  if (!track) {
    console.log(`Track ${trackId}: not found`);

    sendTextResponse(
      res,
      404,
      "Track not found"
    );

    return;
  }

  const filePath = track.path;

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      console.error(
        `Track ${trackId}: could not access audio file`,
        err
      );

      sendTextResponse(
        res,
        404,
        "Audio file not found"
      );

      return;
    }

    const fileSize = stats.size;
    const rangeHeader = req.headers.range;

    console.log(`Track ${trackId}`);
    console.log(`File size: ${fileSize} bytes`);

    /*
     * No Range header:
     * return the entire MP3.
     */
    if (!rangeHeader) {
      console.log("No Range header; streaming complete file");

      res.writeHead(200, {
        "Content-Type": "audio/mpeg",
        "Content-Length": fileSize,
        "Accept-Ranges": "bytes",
      });

      const fileStream = fs.createReadStream(filePath);

      fileStream.on("error", (streamError) => {
        console.error(
          `Track ${trackId}: stream error`,
          streamError
        );

        res.destroy();
      });

      fileStream.pipe(res);

      return;
    }

    console.log(`Range requested: ${rangeHeader}`);

    const range = parseRange(
      rangeHeader,
      fileSize
    );

    if (!range) {
      console.log(
        `Track ${trackId}: invalid range ${rangeHeader}`
      );

      sendInvalidRange(res, fileSize);

      return;
    }

    const { start, end } = range;

    const contentLength =
    end - start + 1;

    console.log(
      `Streaming bytes ${start}-${end}/${fileSize}`
    );

    console.log(
      `Response size: ${contentLength} bytes`
    );

    res.writeHead(206, {
      "Content-Type": "audio/mpeg",
      "Accept-Ranges": "bytes",
      "Content-Length": contentLength,
      "Content-Range":
      `bytes ${start}-${end}/${fileSize}`,
    });

    const fileStream = fs.createReadStream(
      filePath,
      {
        start,
        end,
      }
    );

    fileStream.on("error", (streamError) => {
      console.error(
        `Track ${trackId}: stream error`,
        streamError
      );

      res.destroy();
    });

    fileStream.pipe(res);
  });
}

const server = http.createServer((req, res) => {
  /*
   * We only need URL() so pathname is parsed cleanly.
   * Routing does not depend on the client's Host header.
   */
  const url = new URL(
    req.url,
    "http://localhost"
  );

  // Supported route:
  //
  // GET /api/tracks/1/stream
  // GET /api/tracks/25/stream
  const trackRoute =
  /^\/api\/tracks\/(\d+)\/stream$/.exec(
    url.pathname
  );

  if (
    req.method === "GET" &&
    trackRoute
  ) {
    const trackId =
    Number(trackRoute[1]);

    streamTrack(
      req,
      res,
      trackId
    );

    return;
  }

  sendTextResponse(
    res,
    404,
    "Not found"
  );
});

server.listen(PORT, () => {
  console.log(
    `Soundwave server running on http://localhost:${PORT}`
  );

  console.log(
    `Test track: http://localhost:${PORT}/api/tracks/1/stream`
  );
});
