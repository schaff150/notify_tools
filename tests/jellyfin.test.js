const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { test } = require('node:test');

// Only the final SMS boundary is replaced; the production handler and HTTP fetch run normally.
const notifierPath = require.resolve('../notifier');
const originalNotifier = require.cache[notifierPath];
const sends = [];
let sendFailure = null;
require.cache[notifierPath] = {
    id: notifierPath,
    filename: notifierPath,
    loaded: true,
    exports: { sendEmailSMS: async (...args) => {
        sends.push(args);
        if (sendFailure) throw sendFailure;
    } }
};
const { handleJellyfinWebhook } = require('../workflows/jellyfin');
if (originalNotifier) require.cache[notifierPath] = originalNotifier;
else delete require.cache[notifierPath];

async function createFixture(t, itemTags = ['notify-dad'], apiStatus = 200) {
    sends.length = 0;
    sendFailure = null;
    const dataDir = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'notify-tools-test-'));
    t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
    const requests = [];
    const fixtureKey = 'regression-only-not-a-real-key';
    const server = http.createServer(async (request, response) => {
        // Consume the full request before validating its protocol and returning a response.
        for await (const chunk of request) { void chunk; }
        const url = new URL(request.url, 'http://127.0.0.1');
        requests.push({ method: request.method, url, headers: request.headers });
        const authorized = request.headers.authorization === `MediaBrowser Token="${fixtureKey}"`
            && !url.searchParams.has('api_key') && !url.searchParams.has('ApiKey')
            && !request.headers['x-emby-token'];
        response.writeHead(authorized ? apiStatus : 401, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify(authorized ? {
            Items: [{ Id: url.searchParams.get('Ids'), Tags: typeof itemTags === 'function'
                ? itemTags(url.searchParams.get('Ids')) : itemTags }]
        } : { error: 'Legacy authentication is disabled' }));
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => new Promise(resolve => {
        server.close(resolve);
        server.closeAllConnections();
    }));
    return {
        dataDir,
        requests,
        config: {
            jellyfin: { url: `http://127.0.0.1:${server.address().port}`, api_key: fixtureKey },
            notify_map: [
                { tag: 'notify-dad', phone: '+12025550100' },
                { tag: 'notify-anna', phone: '+12025550101' },
                { tag: 'notify-gin', phone: '+12025550102' },
                { tag: 'notify-jack', phone: '+12025550103' }
            ],
            seerr_user_map: [
                { seerr_username: '2-jellyanna', tag: 'notify-anna' },
                { seerr_username: '3-jellygin', tag: 'notify-gin' },
                { seerr_username: '4-jellyjack', tag: 'notify-jack' }
            ],
            email_sms: {}
        }
    };
}

test('empty webhook tags fall back to authenticated Jellyfin tags and notify the tagged recipient', async t => {
    const fixture = await createFixture(t);
    await handleJellyfinWebhook({
        NotificationType: 'ItemAdded',
        Name: 'Regression Movie',
        ItemId: 'fixture-movie',
        Tags: '',
        SeriesTags: ''
    }, fixture.config, fixture.dataDir);

    assert.equal(sends.length, 1, 'The API fallback must reach the SMS boundary for a tagged arrival');
    assert.equal(sends[0][0], '+12025550100');
    assert.match(sends[0][1], /Regression Movie/);
    assert.equal(fixture.requests.length, 1);
    assert.equal(fixture.requests[0].method, 'GET');
    assert.equal(fixture.requests[0].url.pathname, '/Items');
    assert.equal(fixture.requests[0].url.searchParams.get('Ids'), 'fixture-movie');
    assert.equal(fixture.requests[0].url.searchParams.get('Fields'), 'Tags');
    assert.equal(fixture.requests[0].url.searchParams.has('api_key'), false);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(fixture.dataDir, 'jellyfin_history.json'), 'utf8')),
        ['+12025550100::Regression Movie']);
});

test('item and parent-series lookups authenticate and requester tags route once per recipient', async t => {
    const fixture = await createFixture(t, id => id === 'fixture-series'
        ? ['2-jellyanna', '3-jellygin', '4-jellyjack'] : ['2-jellyanna']);
    await handleJellyfinWebhook({
        NotificationType: 'ItemAdded', Name: 'Regression Episode',
        ItemId: 'fixture-episode', SeriesId: 'fixture-series',
        SeriesName: 'Regression Series', SeasonNumber: 1, EpisodeNumber: 2,
        Tags: '', SeriesTags: ''
    }, fixture.config, fixture.dataDir);

    assert.deepEqual(sends.map(send => send[0]).sort(), ['+12025550101', '+12025550102', '+12025550103']);
    assert.equal(fixture.requests.length, 2);
    assert.deepEqual(fixture.requests.map(request => request.url.searchParams.get('Ids')),
        ['fixture-episode', 'fixture-series']);
    assert.ok(sends.every(send => /Regression Series.*S01E02/.test(send[1])));
});

test('untagged arrivals do not notify anyone', async t => {
    const fixture = await createFixture(t, []);
    await handleJellyfinWebhook({ NotificationType: 'ItemAdded', Name: 'Untagged Movie', ItemId: 'fixture-untagged', Tags: '', SeriesTags: '' },
        fixture.config, fixture.dataDir);
    assert.equal(fixture.requests.length, 1);
    assert.equal(sends.length, 0);
    assert.equal(fs.existsSync(path.join(fixture.dataDir, 'jellyfin_history.json')), false);
});

test('repeated tagged arrivals preserve deduplication', async t => {
    const fixture = await createFixture(t);
    const payload = { NotificationType: 'ItemAdded', Name: 'Dedup Movie', ItemId: 'fixture-dedup', Tags: '', SeriesTags: '' };
    await handleJellyfinWebhook(payload, fixture.config, fixture.dataDir);
    await handleJellyfinWebhook(payload, fixture.config, fixture.dataDir);
    assert.equal(sends.length, 1);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(fixture.dataDir, 'jellyfin_history.json'), 'utf8')),
        ['+12025550100::Dedup Movie']);
});

test('non-arrival events do not fetch tags or send notifications', async t => {
    const fixture = await createFixture(t);
    await handleJellyfinWebhook({ NotificationType: 'PlaybackStart', ItemId: 'fixture-playback', Tags: ['notify-dad'] },
        fixture.config, fixture.dataDir);
    assert.equal(fixture.requests.length, 0);
    assert.equal(sends.length, 0);
});

test('failed Jellyfin authentication does not create a false notification history entry', async t => {
    const fixture = await createFixture(t, ['notify-dad'], 401);
    await handleJellyfinWebhook({ NotificationType: 'ItemAdded', Name: 'Unauthorized Movie', ItemId: 'fixture-unauthorized', Tags: '', SeriesTags: '' },
        fixture.config, fixture.dataDir);
    assert.equal(sends.length, 0);
    assert.equal(fs.existsSync(path.join(fixture.dataDir, 'jellyfin_history.json')), false);
});

test('failed SMS submission remains retryable instead of being deduplicated', async t => {
    const fixture = await createFixture(t);
    sendFailure = new Error('Regression SMTP failure');
    await handleJellyfinWebhook({ NotificationType: 'ItemAdded', Name: 'Retryable Movie', ItemId: 'fixture-retryable', Tags: '', SeriesTags: '' },
        fixture.config, fixture.dataDir);
    assert.equal(sends.length, 1);
    assert.equal(fs.existsSync(path.join(fixture.dataDir, 'jellyfin_history.json')), false);
});

test('payload notification tags still work when no API credential is configured', async t => {
    const fixture = await createFixture(t);
    fixture.config.jellyfin.api_key = '';
    await handleJellyfinWebhook({ NotificationType: 'ItemAdded', Name: 'Payload Movie', ItemId: 'fixture-payload', Tags: 'notify-anna', SeriesTags: '' },
        fixture.config, fixture.dataDir);
    assert.equal(fixture.requests.length, 0);
    assert.deepEqual(sends.map(send => send[0]), ['+12025550101']);
});
