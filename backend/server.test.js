const test = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('./server');

async function withServer(run) {
    const server = app.listen(0);
    await new Promise(resolve => server.once('listening', resolve));
    const { port } = server.address();

    try {
        await run(`http://127.0.0.1:${port}`);
    } finally {
        await new Promise((resolve, reject) => {
            server.close(error => error ? reject(error) : resolve());
        });
    }
}

test('health endpoint reports a disconnected database', async () => {
    await withServer(async baseUrl => {
        const response = await fetch(`${baseUrl}/api/health`);
        assert.equal(response.status, 503);
        assert.deepEqual(await response.json(), {
            status: 'unavailable',
            database: 'disconnected'
        });
    });
});

test('frontend files are served by the backend', async () => {
    await withServer(async baseUrl => {
        const response = await fetch(`${baseUrl}/`);
        assert.equal(response.status, 200);
        assert.match(await response.text(), /FPS Aim Trainer/);
    });
});

test('invalid difficulty is rejected', async () => {
    await withServer(async baseUrl => {
        const response = await fetch(`${baseUrl}/api/scores/legendary`);
        assert.equal(response.status, 400);
        assert.equal((await response.json()).error, 'Invalid difficulty');
    });
});

test('invalid score payload is rejected before database access', async () => {
    await withServer(async baseUrl => {
        const response = await fetch(`${baseUrl}/api/scores`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Player', score: -1, difficulty: 'easy' })
        });
        assert.equal(response.status, 400);
        assert.match((await response.json()).error, /Score/);
    });
});
