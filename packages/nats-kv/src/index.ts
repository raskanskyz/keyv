import {EventEmitter} from 'events';
import {
	connect, type NatsConnection, type JetStreamClient, type KV,
} from 'nats';

export type NatsKvOptions = {
	/**
   * NATS connection options
   */
	servers?: string | string[];

	/**
   * Name of the KV bucket to use
   */
	bucket?: string;

	/**
   * Optional TTL in milliseconds for all entries
   */
	ttl?: number;

	/**
   * Optional namespace for keys
   */
	namespace?: string;

	/**
   * Optional number of replicas for high availability
   */
	replicas?: number;

	/**
   * Connection to reuse (if already connected to NATS)
   */
	connection?: NatsConnection;
};

class KeyvNatsKv extends EventEmitter {
	private _connection: NatsConnection | undefined = undefined;
	private _js: JetStreamClient | undefined = undefined;
	private _kv: KV | undefined = undefined;
	private readonly _ttl: number;
	private readonly _namespace: string;
	private readonly _bucket: string;
	private readonly _replicas: number;
	private readonly _servers: string | string[];
	private readonly _shouldCloseConnection: boolean = false;

	/**
   * Creates a new KeyvNatsKv instance
   *
   * @param {NatsKvOptions} options - Connection options
   */
	constructor(options?: NatsKvOptions) {
		super();

		const options_ = options ?? {};

		this._servers = options_.servers ?? 'nats://localhost:4222';
		this._bucket = options_.bucket ?? 'keyv';
		this._ttl = options_.ttl ?? 0;
		this._namespace = options_.namespace ?? 'keyv';
		this._replicas = options_.replicas ?? 1;

		if (options_?.connection) {
			this._connection = options_.connection;
			this._shouldCloseConnection = false;
		} else {
			this._shouldCloseConnection = true;
		}

		// Attempt to connect immediately
		this.connect().catch(error => {
			this.emit('error', error);
		});
	}

	/**
   * Get the bucket name
   */
	get bucket(): string {
		return this._bucket;
	}

	/**
   * Get the namespace
   */
	get namespace(): string {
		return this._namespace;
	}

	/**
   * Retrieves a value from the store
   *
   * @param {string} key - The key to retrieve
   * @returns {Promise<any>} The value or undefined
   */
	async get(key: string): Promise<any> {
		try {
			await this.ensureConnection();
			const nsKey = this.getNamespacedKey(key);
			const entry = await this._kv!.get(nsKey);

			if (!entry) {
				return undefined;
			}

			return this.processEntryValue(key, entry.value);
		} catch (error) {
			this.emit('error', error);
			return undefined;
		}
	}

	/**
   * Sets a value in the store
   *
   * @param {string} key - The key to set
   * @param {any} value - The value to store
   * @param {number} [ttl] - Optional TTL in milliseconds
   * @returns {Promise<boolean>} Success indicator
   */
	async set(key: string, value: any, ttl?: number): Promise<boolean> {
		try {
			await this.ensureConnection();
			const nsKey = this.getNamespacedKey(key);
			const actualTtl = ttl ?? this._ttl;

			let valueToStore = value;

			// Add expiry if TTL provided
			if (actualTtl > 0) {
				valueToStore = {
					value,
					expires: Date.now() + actualTtl,
				};
			}

			const data = typeof valueToStore === 'string'
				? valueToStore
				: JSON.stringify(valueToStore);

			await this._kv!.put(nsKey, new TextEncoder().encode(data));
			return true;
		} catch (error) {
			this.emit('error', error);
			return false;
		}
	}

	/**
   * Deletes a value from the store
   *
   * @param {string} key - The key to delete
   * @returns {Promise<boolean>} Success indicator
   */
	async delete(key: string): Promise<boolean> {
		try {
			await this.ensureConnection();
			const nsKey = this.getNamespacedKey(key);
			await this._kv!.delete(nsKey);
			return true;
		} catch (error) {
			this.emit('error', error);
			return false;
		}
	}

	/**
   * Clears all values in the namespace
   *
   * @returns {Promise<boolean>} Success indicator
   */
	async clear(): Promise<boolean> {
		try {
			await this.ensureConnection();
			const prefix = `${this._namespace.replaceAll(':', '_')}-`;
			const keys = await this._kv!.keys();
			const deletePromises = [];

			// Filter keys by namespace and delete them
			for await (const key of keys) {
				if (key.startsWith(prefix)) {
					deletePromises.push(this._kv!.delete(key));
				}
			}

			await Promise.all(deletePromises);
			return true;
		} catch (error) {
			this.emit('error', error);
			return false;
		}
	}

	/**
   * Checks if a key exists in the store
   *
   * @param {string} key - The key to check
   * @returns {Promise<boolean>} True if the key exists
   */
	async has(key: string): Promise<boolean> {
		try {
			const value = await this.get(key);
			return value !== undefined;
		} catch {
			return false;
		}
	}

	/**
   * Closes the connection to NATS if it was initiated by this instance
   *
   * @returns {Promise<void>}
   */
	async close(): Promise<void> {
		if (this._shouldCloseConnection && this._connection) {
			await this._connection.close();
			this._connection = undefined;
			this._js = undefined;
			this._kv = undefined;
		}
	}

	/**
   * Process an entry value, handling JSON parsing and expiry
   *
   * @param {string} key - Original key (for deletion if expired)
   * @param {Uint8Array} value - The raw value to process
   * @returns {any} The processed value
   */
	private processEntryValue(key: string, value: Uint8Array): any {
		if (!value || value.length === 0) {
			return undefined;
		}

		const data = new TextDecoder().decode(value);
		if (!data) {
			return undefined;
		}

		try {
			const parsed = JSON.parse(data);

			// Check for expiry
			if (parsed && typeof parsed === 'object' && parsed.expires) {
				if (parsed.expires < Date.now()) {
					this.delete(key).catch(error => {
						this.emit('error', error);
					});
					return undefined;
				}
				return parsed.value;
			}

			return parsed;
		} catch {
			// Not JSON, return as is
			return data;
		}
	}

	/**
   * Establishes connection to NATS and initializes KV store
   */
	private async connect(): Promise<void> {
		try {
			if (!this._connection) {
				this._connection = await connect({
					servers: this._servers,
				});
			}

			this._js = this._connection.jetstream();

			try {
				this._kv = await this._js.views.kv(this._bucket, {
					replicas: this._replicas,
				});
			} catch {
				// KV store likely exists
				this._kv = await this._js.views.kv(this._bucket);
			}
		} catch (error) {
			this.emit('error', error);
			throw error;
		}
	}

	/**
   * Builds a namespaced key
   *
   * @param {string} key - The key to namespace
   * @returns {string} The namespaced key
   */
	private getNamespacedKey(key: string): string {
		const sanitizedNamespace = this._namespace.replaceAll(':', '_');
		const sanitizedKey = key.replaceAll(':', '_');
		return `${sanitizedNamespace}-${sanitizedKey}`;
	}

	/**
   * Ensures KV connection is established
   */
	private async ensureConnection(): Promise<void> {
		if (!this._kv) {
			await this.connect();
		}
	}
}

// Re-export with the old name for backward compatibility
export {KeyvNatsKv as KeyvNatsKV};
export default KeyvNatsKv;
