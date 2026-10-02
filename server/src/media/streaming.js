import fs from "node:fs";

const CHUNK_SIZE = 1024 * 1024;

function sendTextResponse(res, statusCode, message) {
    res.writeHead(statusCode, {
        "Content-Type": "text/plain",
    });

    res.end(message);
}

function sendInvalidRange(res, fileSize) {
    res.writeHead(416, {
        "Content-Range": `bytes */${fileSize}`,
    });

    res.end();
}

export function parseRange(rangeHeader, fileSize) {
    const match = /^bytes=(\d+)-(\d*)$/.exec(rangeHeader);

    if (!match) {
        return null;
    }

    const start = Number(match[1]);

    if (start >= fileSize) {
        return null;
    }

    let end;

    if (match[2]) {
        end = Number(match[2]);

        if (end < start) {
            return null;
        }

        end = Math.min(end, fileSize - 1);
    } else {
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

export function streamTrackFile(
    req,
    res,
    filePath
) {
    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            sendTextResponse(
                res,
                404,
                "Audio file not found"
            );

            return;
        }

        const fileSize = stats.size;
        const rangeHeader = req.headers.range;

        if (!rangeHeader) {
            res.writeHead(200, {
                "Content-Type": "audio/mpeg",
                "Content-Length": fileSize,
                "Accept-Ranges": "bytes",
            });

            const fileStream =
            fs.createReadStream(filePath);

            fileStream.on("error", () => {
                res.destroy();
            });

            fileStream.pipe(res);

            return;
        }

        const range = parseRange(
            rangeHeader,
            fileSize
        );

        if (!range) {
            sendInvalidRange(
                res,
                fileSize
            );

            return;
        }

        const {
            start,
            end
        } = range;

        const contentLength =
        end - start + 1;

        res.writeHead(206, {
            "Content-Type": "audio/mpeg",
            "Accept-Ranges": "bytes",
            "Content-Length": contentLength,
            "Content-Range":
            `bytes ${start}-${end}/${fileSize}`,
        });

        const fileStream =
        fs.createReadStream(
            filePath,
            {
                start,
                end,
            }
        );

        fileStream.on("error", () => {
            res.destroy();
        });

        fileStream.pipe(res);
    });
}
