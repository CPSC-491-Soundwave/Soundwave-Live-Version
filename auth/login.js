import { verify } from '../password-hasher/hasher.js';

const MAX_BODY_BYTES = 16 * 1024;

function writeJson(res, statusCode, body) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
    });

    res.end(JSON.stringify(body));
}

function writeInvalidCredentials(res) {
    writeJson(res, 401, {
        error: 'Invalid username or password'
    });
}

function readJsonBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        let bodySize = 0;
        let bodyTooLarge = false;

        req.setEncoding('utf8');

        req.on('data', (chunk) => {
            bodySize += Buffer.byteLength(chunk, 'utf8');

            if (bodySize > MAX_BODY_BYTES) {
                bodyTooLarge = true;
                return;
            }

            body += chunk;
        });

        req.on('end', () => {
            if (bodyTooLarge) {
                const error = new Error('Request body too large');
                error.code = 'BODY_TOO_LARGE';
                reject(error);
                return;
            }

            if (body.trim() === '') {
                resolve({});
                return;
            }

            try {
                resolve(JSON.parse(body));
            } catch {
                const error = new Error('Invalid JSON');
                error.code = 'INVALID_JSON';
                reject(error);
            }
        });

        req.on('error', reject);
    });
}

/**
 * Handles POST /auth/login.
 *
 * findUserByUsername(username) must eventually be supplied by the
 * database/repository layer and should return:
 *
 * {
 *   id,
 *   username,
 *   password_hash,
 *   role
 * }
 *
 * or null if no matching user exists.
 */
export async function handleLogin(
    req,
    res,
    {
        findUserByUsername,
        tokenService
    }
) {
    if (typeof findUserByUsername !== 'function') {
        throw new TypeError('findUserByUsername must be a function');
    }

    if (
        !tokenService ||
        typeof tokenService.create_token !== 'function'
    ) {
        throw new TypeError(
            'tokenService must provide create_token()'
        );
    }

    let body;

    try {
        body = await readJsonBody(req);
    } catch (error) {
        if (error.code === 'BODY_TOO_LARGE') {
            writeJson(res, 413, {
                error: 'Request body too large'
            });
            return;
        }

        if (error.code === 'INVALID_JSON') {
            writeJson(res, 400, {
                error: 'Invalid JSON'
            });
            return;
        }

        writeJson(res, 500, {
            error: 'Internal server error'
        });
        return;
    }

    const username =
        typeof body.username === 'string'
            ? body.username.trim()
            : '';

    const password =
        typeof body.password === 'string'
            ? body.password
            : '';

    if (!username || !password) {
        writeJson(res, 400, {
            error: 'Username and password are required'
        });
        return;
    }

    let user;

    try {
        user = await findUserByUsername(username);
    } catch {
        writeJson(res, 500, {
            error: 'Internal server error'
        });
        return;
    }

    if (!user) {
        writeInvalidCredentials(res);
        return;
    }

    let passwordMatches;

    try {
        passwordMatches = await verify(
            user.password_hash,
            password
        );
    } catch {
        writeJson(res, 500, {
            error: 'Internal server error'
        });
        return;
    }

    if (!passwordMatches) {
        writeInvalidCredentials(res);
        return;
    }

    let accessToken;

    try {
        accessToken = tokenService.create_token({
            id: user.id,
            role: user.role
        });
    } catch {
        writeJson(res, 500, {
            error: 'Internal server error'
        });
        return;
    }

    writeJson(res, 200, {
        accessToken,
        tokenType: 'Bearer'
    });
}
