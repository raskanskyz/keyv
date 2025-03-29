import * as test from 'vitest';
// @ts-ignore - importing keyv without type declarations
import Keyv from 'keyv';
// @ts-ignore - importing test suite without type declarations
import keyvTestSuite from '@keyv/test-suite';
import KeyvNatsKv from '../src/index.js';

// Add type declarations for the external modules
declare module 'keyv' {
	export default class Keyv {
		constructor(options?: any);
		get(key: string): Promise<any>;
		set(key: string, value: any, ttl?: number): Promise<boolean>;
		delete(key: string): Promise<boolean>;
		clear(): Promise<void>;
		has(key: string): Promise<boolean>;
		on(event: string, callback: (...args: any[]) => void): void;
	}
}

declare module '@keyv/test-suite' {
	export default function keyvTestSuite(test: any, Keyv: any, store: () => any): void;
}

const natsUrl = 'nats://localhost:4222';

// Create a simple store function for the keyv test suite
const store = () => new KeyvNatsKv({
	servers: natsUrl,
	bucket: 'keyv-test',
	namespace: 'keyv-test',
});

// Run the standard Keyv test suite on our implementation
keyvTestSuite(test, Keyv, store);
// NATS KV doesn't have native iterators, so we don't run the iterator tests

// Clear the store before each test
test.beforeEach(async () => {
	const keyv = new KeyvNatsKv({
		servers: natsUrl,
		bucket: 'keyv-test',
	});
	await keyv.clear();
});

// Test default options
test.it('default options', t => {
	const store = new KeyvNatsKv();
	t.expect(store.namespace).toBe('keyv');
	t.expect(store.bucket).toBe('keyv');
});

// Test custom options
test.it('custom options', t => {
	const store = new KeyvNatsKv({
		servers: natsUrl,
		bucket: 'custom-bucket',
		namespace: 'custom-namespace',
		ttl: 1000,
		replicas: 3,
	});

	t.expect(store.namespace).toBe('custom-namespace');
	t.expect(store.bucket).toBe('custom-bucket');
});

// Helper function for testing TTL
async function sleep(ms: number): Promise<void> {
	return new Promise(resolve => {
		setTimeout(resolve, ms);
	});
}

// Test TTL option
test.it('respects TTL option', async t => {
	const keyv = new KeyvNatsKv({
		servers: natsUrl,
		bucket: 'keyv-test',
		ttl: 1000,
	});

	await keyv.set('foo', 'bar');
	t.expect(await keyv.get('foo')).toBe('bar');
	await sleep(1500);
	t.expect(await keyv.get('foo')).toBeUndefined();
});

// Test TTL in set method
test.it('respects TTL in set method', async t => {
	const keyv = new KeyvNatsKv({
		servers: natsUrl,
		bucket: 'keyv-test',
	});

	await keyv.set('foo', 'bar', 1000);
	t.expect(await keyv.get('foo')).toBe('bar');
	await sleep(1500);
	t.expect(await keyv.get('foo')).toBeUndefined();
});

// Test basic methods
test.it('basic CRUD operations work', async t => {
	const keyv = new KeyvNatsKv({
		servers: natsUrl,
		bucket: 'keyv-test',
	});

	// get returns undefined for non-existent key
	t.expect(await keyv.get('non-existent-key')).toBeUndefined();
	
	// set and get work
	await keyv.set('foo', 'bar');
	t.expect(await keyv.get('foo')).toBe('bar');
	
	// delete works
	t.expect(await keyv.delete('foo')).toBeTruthy();
	t.expect(await keyv.get('foo')).toBeUndefined();
	
	// has works
	await keyv.set('exists', 'value');
	t.expect(await keyv.has('exists')).toBeTruthy();
	t.expect(await keyv.has('non-existent')).toBeFalsy();
});

// Test object handling
test.it('handles complex objects', async t => {
	const keyv = new KeyvNatsKv({
		servers: natsUrl,
		bucket: 'keyv-test',
	});

	const complexObject = {
		foo: 'bar',
		baz: 42,
		qux: {
			nested: true,
			items: [1, 2, 3],
		},
	};

	await keyv.set('complex', complexObject);
	const retrieved = await keyv.get('complex');
	t.expect(retrieved).toEqual(complexObject);
});

// Test namespace isolation
test.it('namespaced keys are isolated', async t => {
	const keyv1 = new KeyvNatsKv({
		servers: natsUrl,
		bucket: 'keyv-test',
		namespace: 'namespace1',
	});

	const keyv2 = new KeyvNatsKv({
		servers: natsUrl,
		bucket: 'keyv-test',
		namespace: 'namespace2',
	});

	await keyv1.set('foo', 'bar1');
	await keyv2.set('foo', 'bar2');

	t.expect(await keyv1.get('foo')).toBe('bar1');
	t.expect(await keyv2.get('foo')).toBe('bar2');

	await keyv1.clear();

	t.expect(await keyv1.get('foo')).toBeUndefined();
	t.expect(await keyv2.get('foo')).toBe('bar2');
});

// Test Keyv integration
test.it('works with Keyv', async t => {
	const natsStore = new KeyvNatsKv({
		servers: natsUrl,
		bucket: 'keyv-test',
		namespace: 'keyv-integration',
	});

	// @ts-ignore - using keyv without type declarations
	const keyv = new Keyv({store: natsStore});

	await keyv.set('foo', 'bar');
	t.expect(await keyv.get('foo')).toBe('bar');
	t.expect(await keyv.delete('foo')).toBeTruthy();
	t.expect(await keyv.get('foo')).toBeUndefined();

	await natsStore.close();
});

// Test error events
test.it('emits error events', async t => {
	const keyv = new KeyvNatsKv({
		servers: 'nats://invalid-host:4222', // Invalid host to trigger error
		bucket: 'keyv-test',
	});

	let errorEmitted = false;
	keyv.on('error', () => {
		errorEmitted = true;
	});

	// Attempt an operation that should fail
	await keyv.get('foo');
	t.expect(errorEmitted).toBeTruthy();
});
