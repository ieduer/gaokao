import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(process.env.GK_PROGRESS_TEST_SOURCE || new URL('../assets/js/app.js', import.meta.url), 'utf8');
const questions = [
    { year: 2026, key: 'guwen', id: 'CN-BJ-2026-02' },
    { year: 2026, key: 'shici', id: 'CN-BJ-2026-03' },
    { year: 2025, key: 'guwen', topic: 'A published topic' },
];
const record = (type = 'guwen', state = 'in_progress', extra = {}) => ({
    siteKey: 'gk', itemKey: `question-2026-${type}-CN-BJ-2026-${type === 'guwen' ? '02' : '03'}`,
    state, ...extra,
});
const old = { 'sanwen-2020': 'done', 'question-2026': 'in_progress' };
function button(key) {
    const classes = new Set();
    return { dataset: { progressKey: key }, textContent: `${key.split('-').at(-1)} 年`, classes,
        classList: { add: x => classes.add(x), remove: (...xs) => xs.forEach(x => classes.delete(x)) } };
}
function browser({ saved = old, session = async () => ({ authenticated: true }), request = async () => ({ items: [] }), sdk = true, buttons = [], storage } = {}) {
    const values = storage || new Map([['gaokao_read_progress', JSON.stringify(saved)]]);
    const calls = [], logs = [], events = new Map();
    const context = vm.createContext({
        console: Object.fromEntries(['log', 'debug', 'warn', 'error'].map(k => [k, (...args) => logs.push(args)])),
        window: { BdfzIdentity: sdk ? {
            ...(session ? { getSession: async () => { calls.push('session'); return session(); } } : {}),
            api: async path => { calls.push(path); return request(); },
        } : undefined, addEventListener: (name, fn) => events.set(name, fn) },
        document: { addEventListener() {}, getElementById: id => id === 'gaokao-year-menu' ? { querySelectorAll: () => buttons } : null },
        localStorage: { getItem: k => values.get(k) || null, setItem: (k, v) => values.set(k, v) },
    });
    vm.runInContext(source, context);
    context.fixtureQuestions = questions;
    vm.runInContext('allData = fixtureQuestions; loadLocalReadProgress();', context);
    return { calls, logs, events, storage: values, run: code => vm.runInContext(code, context),
        records: () => JSON.parse(values.get('gaokao_read_progress')) };
}

test('anonymous page never requests protected progress and preserves local history', async () => {
    const b = browser({ session: async () => ({ authenticated: false }) });
    await b.run('hydrateReadProgressFromIdentity()');
    assert.deepEqual(b.calls, ['session']); assert.deepEqual(b.records(), old);
});
test('missing SDK/session capability does not fall through to protected reads', async () => {
    for (const options of [{ sdk: false }, { session: null }]) {
        const b = browser(options); await b.run('hydrateReadProgressFromIdentity()');
        assert.deepEqual(b.calls, []); assert.deepEqual(b.records(), old);
    }
});
test('session transport failure logs a finite reason without private error content', async () => {
    const b = browser({ session: async () => { throw new Error('PRIVATE SESSION DETAIL'); } });
    await b.run('hydrateReadProgressFromIdentity()');
    assert.deepEqual(b.calls, ['session']); assert.deepEqual(b.records(), old);
    assert.match(JSON.stringify(b.logs), /session_unavailable/);
    assert.doesNotMatch(JSON.stringify(b.logs), /PRIVATE/);
});
test('year-first exact published keys restore their category with hyphenated IDs', async () => {
    const b = browser({ request: async () => ({ items: [record()] }) });
    await b.run('hydrateReadProgressFromIdentity()');
    assert.deepEqual(b.records(), { ...old, 'guwen-2026': 'in_progress' });
    assert.deepEqual(b.calls, ['session', '/api/progress?site=gk']);
});
test('canonical completed and legacy done states restore without requiring a percent', async () => {
    for (const state of ['completed', 'done']) {
        const b = browser({ request: async () => ({ items: [record('guwen', state, { itemKey: 'answer-2026-guwen-CN-BJ-2026-02' })] }) });
        await b.run('hydrateReadProgressFromIdentity()'); assert.equal(b.records()['guwen-2026'], 'done');
    }
});
test('central meta percent and legacy top-level percent restore completed reading', async () => {
    for (const extra of [{ meta: { progressPercent: 100 } }, { progressPercent: 100 }]) {
        const b = browser({ request: async () => ({ items: [record('guwen', 'in_progress', extra)] }) });
        await b.run('hydrateReadProgressFromIdentity()'); assert.equal(b.records()['guwen-2026'], 'done');
    }
});
test('completed local or remote state is never downgraded by later viewed records', async () => {
    const b = browser({ saved: { ...old, 'shici-2026': 'done' }, request: async () => ({ items: [record('guwen', 'completed'), record(), record('shici')] }) });
    await b.run('hydrateReadProgressFromIdentity()');
    assert.deepEqual(b.records(), { ...old, 'shici-2026': 'done', 'guwen-2026': 'done' });
});
test('unknown, custom, other-site and invalid-state records never create inferred local keys', async () => {
    const b = browser({ request: async () => ({ items: [
        record('guwen', 'completed', { itemKey: 'question-2026-guwen-unknown' }),
        record('guwen', 'completed', { itemKey: 'answer-custom-question-PRIVATE' }),
        record('guwen', 'completed', { siteKey: 'mf' }),
        record('guwen', 'archived', { meta: { progressPercent: 100 } }), null,
    ] }) });
    await b.run('hydrateReadProgressFromIdentity()'); assert.deepEqual(b.records(), old);
    assert.doesNotMatch(JSON.stringify(b.logs), /PRIVATE|CN-BJ/);
});
test('failed protected reads preserve local bytes and recover on ordinary focus', async () => {
    for (const status of [401, 503]) {
        let fail = true;
        const b = browser({ request: async () => { if (fail) throw Object.assign(new Error('PRIVATE'), { status }); return { items: [record()] }; } });
        const before = b.storage.get('gaokao_read_progress');
        await b.run('hydrateReadProgressFromIdentity()'); assert.equal(b.storage.get('gaokao_read_progress'), before);
        assert.doesNotMatch(JSON.stringify(b.logs), /PRIVATE/); fail = false;
        await b.events.get('focus')(); assert.equal(b.records()['guwen-2026'], 'in_progress');
    }
});
test('malformed progress response preserves local data and reports finite failure', async () => {
    const b = browser({ request: async () => ({ items: { private: 'PRIVATE' } }) });
    await b.run('hydrateReadProgressFromIdentity()'); assert.deepEqual(b.records(), old);
    assert.match(JSON.stringify(b.logs), /invalid_payload/); assert.doesNotMatch(JSON.stringify(b.logs), /PRIVATE/);
});
test('simultaneous startup and focus share one hydration', { timeout: 1000 }, async () => {
    const pending = [];
    const b = browser({ request: () => new Promise(resolve => pending.push(resolve)) });
    const first = b.run('hydrateReadProgressFromIdentity()');
    await new Promise(resolve => setImmediate(resolve));
    const second = b.run('hydrateReadProgressFromIdentity()');
    await new Promise(resolve => setImmediate(resolve));
    pending.forEach(resolve => resolve({ items: [record()] }));
    await Promise.all([first, second]);
    assert.equal(b.calls.filter(x => x.startsWith('/api')).length, 1);
});
test('login return restores after initial anonymous state; reload keeps old records', async () => {
    let authenticated = false;
    const b = browser({ session: async () => ({ authenticated }), request: async () => ({ items: [record('guwen', 'completed')] }) });
    await b.run('hydrateReadProgressFromIdentity()'); assert.deepEqual(b.records(), old);
    authenticated = true; await b.events.get('focus')();
    const restored = browser({ storage: b.storage }); await restored.run('hydrateReadProgressFromIdentity()');
    assert.deepEqual(restored.records(), { ...old, 'guwen-2026': 'done' });
});
test('same-year status stays specific to its type and clears stale button classes', () => {
    const buttons = ['guwen-2026', 'shici-2026', 'sanwen-2026', 'guwen-2025'].map(button);
    buttons.forEach(x => x.classes.add('read'));
    const b = browser({ saved: { 'guwen-2026': 'done', 'shici-2026': 'in_progress' }, buttons });
    b.run('updateYearMenuReadStatus()');
    assert.deepEqual(buttons.map(x => [...x.classes]), [['read'], ['reading'], [], []]);
});
test('topic fallback uses the writer exact key without guessing split positions', async () => {
    const b = browser({ request: async () => ({ items: [record('guwen', 'completed', { itemKey: 'answer-2025-guwen-A-published-topic' })] }) });
    await b.run('hydrateReadProgressFromIdentity()'); assert.equal(b.records()['guwen-2025'], 'done');
});
