import { resolve, sep } from 'path';
import fs from 'fs';
import {
  get as _get,
  set as _set,
  has as _has,
  isNil,
  isFunction,
  isObject,
  toPath,
  merge,
  clone,
  cloneDeep,
} from 'lodash';
import serialize from 'serialize-javascript';
import onChange from 'on-change';
import {
  EnhancedMapError,
  EnhancedMapOptionsError,
  EnhancedMapArgumentError,
  EnhancedMapDatabaseConnectionError,
  EnhancedMapDestroyedError,
  EnhancedMapImportError,
  EnhancedMapKeyError,
  EnhancedMapKeyTypeError,
  EnhancedMapPathError,
  EnhancedMapTypeError,
} from './error';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import Database from 'better-sqlite3';
import type { MathOps, Path, PathValue } from './types';

// Package.json
const pkgdata = require('../package.json');

interface EnmapOptions<V> {
  name?: string;
  fetchAll?: boolean;
  autoFetch?: boolean;
  dataDir?: string;
  default?: V;
  wal?: boolean;
  verbose?: (query: string) => void;
  /**
   * If a function is provided, it will execute on the data when it is written to the database.
   * This is generally used to convert the value into a format that can be saved in the database, such as converting a complete class instance to just its ID.
   * This function may return the value to be saved, or a promise that resolves to that value (in other words, can be an async function).
   */
  serializer?: (data: V) => V;
  /**
   * If a function is provided, it will execute on the data when it is read from the database.
   * This is generally used to convert the value from a stored ID into a more complex object.
   * This function may return a value, or a promise that resolves to that value (in other words, can be an async function).
   */
  deserializer?: (data: V) => V;
}

/**
 * A enhanced Map structure with additional utility methods.
 * Can be made persistent.
 */
export class EnhancedMap<V> extends Map<string, V> {
  serializer: (data: V, key: string) => V;
  deserializer: (data: V, key: string) => V;
  name: string;
  changedCB: any;
  inMemory: boolean;
  verbose?: boolean;
  default: V | {};
  db?: SqliteDatabase;
  database?: SqliteDatabase;
  persistent: boolean;
  isDestroyed: boolean;
  wal: any;
  fetchAll?: boolean;
  defer: any;
  autoFetch?: boolean;
  dataDir?: string;
  cloneLevel: string;

  /**
   * Initializes a new enhanced map with options.
   */
  constructor(
    iterable?: Iterable<[string, V]> | string | EnmapOptions<V>,
    options: EnmapOptions<V> = {},
  ) {
    if (typeof iterable === 'string') {
      options.name = iterable;
      iterable = null;
    }
    if (!iterable || typeof iterable[Symbol.iterator] !== 'function') {
      options = iterable || options;
      iterable = null;
    }
    super();

    this.default = options.default ?? {};
    this.cloneLevel = 'deep';
    this.serializer = options.serializer ?? ((data: V) => data);
    this.deserializer = options.deserializer ?? ((data: V) => data);
    this.name = options.name ?? 'MemoryEnmap';
    this.persistent = Boolean(options.name);
    this.inMemory = this.persistent || this.name === '::memory::';
    this.isDestroyed = false;
    this.dataDir = this.inMemory
      ? undefined
      : resolve(process.cwd(), options.dataDir || 'data');

    // Create the data directory to store the sql db
    if (!this.inMemory && this.persistent && this.dataDir) {
      fs.mkdir(this.dataDir, (error) => {
        if (error && error.code !== 'EEXIST') throw error;
      });
    }

    // Setup the sqlite db
    if (this.persistent) {
      this.autoFetch = options.autoFetch ?? true;
      this.fetchAll = options.fetchAll ?? true;
      this.wal = options.wal ?? false;

      this.database = this.inMemory
        ? new Database(':memory:', this.verbose ? { verbose: console.log } : ({}))
        : new Database(`${this.dataDir!}${sep}enmap.sqlite`, this.verbose ? { verbose: console.log } : ({}));

      this._validateName();
      this._init(this.database);
    }

    if (iterable) {
      if (options.name) {
        console.warn(
          `WARNING: Iterable ignored for persistent Enmap ${options.name}`,
        );
        return;
      }

      for (const [key, value] of iterable) {
        this._internalSet(key, value);
      }
    }
  }

  /**
   * Sets a value in Enmap.
   * @param key Required. The key of the element to add to The Enmap.
   * @param value Required. The value of the element to add to The Enmap.
   * If the Enmap is persistent this value MUST be stringifiable as JSON.
   * @param path Optional. The path to the property to modify inside the value object or array.
   * Can be a path with dot notation, such as "prop1.subprop2.subprop3"
   * @example
   * // Direct Value Examples
   * enmap.set('simplevalue', 'this is a string');
   * enmap.set('isEnmapGreat', true);
   * enmap.set('TheAnswer', 42);
   * enmap.set('IhazObjects', { color: 'black', action: 'paint', desire: true });
   * enmap.set('ArraysToo', [1, "two", "tree", "foor"])
   *
   * // Settings Properties
   * enmap.set('IhazObjects', 'blue', 'color'); //modified previous object
   * enmap.set('ArraysToo', 'three', 2); // changes "tree" to "three" in array.
   * @returns {EnhancedMap} The enmap.
   */
  set(key: string, value: V, path?: string): this {
    if (isNil(key) || key.constructor.name !== 'String') {
      throw new EnhancedMapKeyTypeError(
        `Enmap requires keys to be a string. Provided: ${
          isNil(key) ? 'nil' : key.constructor.name
        }`,
      );
    }
    key = key.toString();
    let data = this.get(key);
    const oldValue = super.has(key) ? this._clone(data) : null;
    if (!isNil(path)) {
      if (isNil(data)) data = {};
      _set(data, path, value);
    } else {
      data = value;
    }
    if (isFunction(this.changedCB)) {
      this.changedCB(key, oldValue, data);
    }
    this._internalSet(key, data, false);
    return super.set(key, this._clone(data));
  }

  /**
   * Update an existing object value in Enmap by merging new keys. **This only works on objects**, any other value will throw an error.
   * Heavily inspired by setState from React's class components.
   * This is very useful if you have many different values to update and don't want to have more than one .set(key, value, prop) lines.
   * @param key The key of the object to update.
   * @param {*} valueOrFunction Either an object to merge with the existing value, or a function that provides the existing object
   * and expects a new object as a return value. In the case of a straight value, the merge is recursive and will add any missing level.
   * If using a function, it is your responsibility to merge the objects together correctly.
   * @example
   * // Define an object we're going to update
   * enmap.set("obj", { a: 1, b: 2, c: 3 });
   *
   * // Direct merge
   * enmap.update("obj", { d: 4, e: 5 });
   * // obj is now { a: 1, b: 2, c: 3, d: 4, e: 5 }
   *
   * // Functional update
   * enmap.update("obj", (previous) => ({
   *   ...obj,
   *   f: 6,
   *   g: 7
   * }));
   * // this example takes heavy advantage of the spread operators.
   * // More info: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Spread_syntax
   */
  update(key: string, valueOrFunction) {
    this._readyCheck();
    if (isNil(key)) {
      throw new EnhancedMapKeyError('Key not provided for update function');
    }
    this._check(key, ['Object']);
    this._fetchCheck(key);
    const previousValue = this.get(key);
    const fn = isFunction(valueOrFunction)
      ? valueOrFunction
      : () => merge(previousValue, valueOrFunction);
    const merged = fn(previousValue);
    this._internalSet(key, merged);
    return merged;
  }

  /**
   * Retrieves a key from the enmap.
   * @param key The key to retrieve from the enmap.
   * @param path Optional. The property to retrieve from the object or array.
   * Can be a path with dot notation, such as "prop1.subprop2.subprop3"
   * @example
   * const myKeyValue = enmap.get("myKey");
   * console.log(myKeyValue);
   *
   * const someSubValue = enmap.get("anObjectKey", "someprop.someOtherSubProp");
   * @return {*} The value for this key.
   */
  get(key: string): V | undefined;
  get<P extends keyof V>(key: string, path?: P): V[P] | undefined;
  get<P extends Path<V>>(key: string, path?: P): PathValue<V, P> | undefined;
  get(key: string, path?: string): unknown {
    this._readyCheck();
    if (isNil(key)) return null;
    this._fetchCheck(key);
    key = key.toString();
    if (this.default && !this.has(key)) {
      this._internalSet(key, this.default);
    }
    const data = super.get(key);
    if (!isNil(path)) {
      this._check(key, ['Object', 'Array']);
      return _get(data, path);
    }
    return this._clone(data);
  }

  /**
   * Returns an observable object. Modifying this object or any of its properties/indexes/children
   * will automatically save those changes into enmap. This only works on
   * objects and arrays, not "basic" values like strings or integers.
   * @param key The key to retrieve from the enmap.
   * @param path The property to retrieve from the object or array.
   */
  observe(key: string, path?: string) {
    this._check(key, ['Object', 'Array'], path);
    const data = this.get(key, path);
    const proxy = onChange(data, () => {
      this.set(key, proxy, path);
    });
    return proxy;
  }

  /**
   * Retrieves the number of rows in the database for this enmap, even if they aren't fetched.
   * @return The number of rows in the database.
   */
  get count(): number {
    return this.db
      ?.prepare(`SELECT count(*) FROM ${this._escapeSQL(this.name)}`)
      .get().count;
  }

  /**
   * Retrieves all the indexes (keys) in the database for this enmap, even if they aren't fetched.
   * @return Array of all indexes (keys) in the enmap, cached or not.
   */
  get indexes(): string[] {
    return (
      this.db
        ?.prepare(`SELECT key FROM ${this._escapeSQL(this.name)};`)
        .all()
        ?.map((row) => row.key) ?? []
    );
  }

  /**
   * Fetches every key from the persistent enmap and loads them into the current enmap value.
   * @return The enmap containing all values.
   */
  fetchEverything() {
    this._readyCheck();
    const rows = this.db
      ?.prepare(`SELECT * FROM ${this._escapeSQL(this.name)};`)
      .all();
    if (!rows) return this;
    for (const row of rows) {
      const val = this._parseData(row.value, row.key);
      super.set(row.key, val);
    }
    return this;
  }

  /**
   * Force fetch one or more key values from the enmap. If the database has changed, that new value is used.
   * @param keyOrKeys A single key or array of keys to force fetch from the enmap database.
   * @return The Enmap, including the new fetched values, or the value in case the function argument is a single key.
   */
  fetch(
    keyOrKeys: string | number | Array<string | number>,
  ): EnhancedMap<V> | V | null {
    this._readyCheck();
    if (Array.isArray(keyOrKeys)) {
      const data = this.db
        ?.prepare(
          `SELECT * FROM ${this._escapeSQL(
            this.name,
          )} WHERE key IN (${'?, '.repeat(keyOrKeys.length).slice(0, -2)})`,
        )
        .all(keyOrKeys);
      if (!data) return null;
      for (const row of data) {
        super.set(row.key, this._parseData(row.value, row.key));
      }
      return this;
    } else {
      const data = this.db
        ?.prepare(`SELECT * FROM ${this._escapeSQL(this.name)} WHERE key = ?;`)
        .get(keyOrKeys);
      if (!data) return null;
      super.set(keyOrKeys, this._parseData(data.value, keyOrKeys));
      return this._parseData(data.value, keyOrKeys);
    }
  }

  /**
   * Removes a key or keys from the cache - useful when disabling autoFetch.
   * @param keyOrArrayOfKeys A single key or array of keys to remove from the cache.
   * @returns The enmap minus the evicted keys.
   */
  evict(
    keyOrArrayOfKeys: string | number | Array<string | number>,
  ): EnhancedMap<V> {
    if (Array.isArray(keyOrArrayOfKeys)) {
      keyOrArrayOfKeys.forEach((key) => super.delete(key));
    } else {
      super.delete(keyOrArrayOfKeys);
    }
    return this;
  }

  /**
   * Generates an automatic numerical key for inserting a new value.
   * This is a "weak" method, it ensures the value isn't duplicated, but does not
   * guarantee it's sequential (if a value is deleted, another can take its place).
   * Useful for logging, actions, items, etc - anything that doesn't already have a unique ID.
   * @example
   * enmap.set(enmap.autonum, "This is a new value");
   * @return The generated key number.
   */
  get autonum(): number {
    const lastNum =
      this.db
        ?.prepare<{ name: string }>(
          "SELECT lastnum FROM 'internal::autonum' WHERE enmap = :name",
        )
        .get({ name: this.name }) + 1;
    this.db
      ?.prepare<{
        name: string;
        lastNumber: number;
      }>(
        "INSERT OR REPLACE INTO 'internal::autonum' (enmap, lastnum) VALUES (:name, :lastNumber)",
      )
      .run({ name: this.name, lastNumber: lastNum });
    return lastNum.toString();
  }

  /**
   * Function called whenever data changes within Enmap after the initial load.
   * Can be used to detect if another part of your code changed a value in enmap and react on it.
   * @example
   * enmap.changed((keyName, oldValue, newValue) => {
   *   console.log(`Value of ${keyName} has changed from: \n${oldValue}\nto\n${newValue}`);
   * });
   * @param cb A callback function that will be called whenever data changes in the enmap.
   */
  changed(cb: () => void) {
    this.changedCB = cb;
  }

  /**
   * Shuts down the database. WARNING: USING THIS MAKES THE ENMAP UNUSABLE. You should
   * only use this method if you are closing your entire application.
   * This is useful if you need to copy the database somewhere else, or if you're somehow losing data on shutdown.
   */
  close() {
    this._readyCheck();
    return this.database?.close();
  }

  /**
   * Push to an array value in Enmap.
   * @param key Required. The key of the array element to push to in Enmap.
   * This value MUST be a string or number.
   * @param {*} val Required. The value to push to the array.
   * @param path Optional. The path to the property to modify inside the value object or array.
   * Can be a path with dot notation, such as "prop1.subprop2.subprop3"
   * @param allowDupes Optional. Allow duplicate values in the array (default: false).
   * @example
   * // Assuming
   * enmap.set("simpleArray", [1, 2, 3, 4]);
   * enmap.set("arrayInObject", {sub: [1, 2, 3, 4]});
   *
   * enmap.push("simpleArray", 5); // adds 5 at the end of the array
   * enmap.push("arrayInObject", "five", "sub"); // adds "five" at the end of the sub array
   * @returns {EnhancedMap} The enmap.
   */
  push(key: string, val, path?: string, allowDupes = false) {
    const data = this.get(key);
    this._check(key, 'Array', path);
    if (!isNil(path)) {
      const propValue = _get(data, path);
      if (!allowDupes && propValue.indexOf(val) > -1) return this;
      propValue.push(val);
      _set(data, path, propValue);
    } else {
      if (!allowDupes && data.indexOf(val) > -1) return this;
      data.push(val);
    }
    return this._internalSet(key, data);
  }

  // AWESOME MATHEMATICAL METHODS

  /**
   * Executes a mathematical operation on a value and saves it in the enmap.
   * @param key The enmap key on which to execute the math operation.
   * @param operation Which mathematical operation to execute. Supports most
   * math ops: =, -, *, /, %, ^, and english spelling of those operations.
   * @param operand The right operand of the operation.
   * @param path The property path to execute the operation on, if the value is an object or array.
   * @example
   * // Assuming
   * points.set("number", 42);
   * points.set("numberInObject", {sub: { anInt: 5 }});
   *
   * points.math("number", "/", 2); // 21
   * points.math("number", "add", 5); // 26
   * points.math("number", "modulo", 3); // 2
   * points.math("numberInObject", "+", 10, "sub.anInt");
   */
  math(key: string, operation: MathOps, operand: number, path: keyof V) {
    this._check(key, 'Number', path as string);
    const data = this.get(key, path);
    const result = this._mathop(data, operation, operand);
    return this.set(key, result, path);
  }

  /**
   * Increments a key's value or property by 1. Value must be a number, or a path to a number.
   * @param key The enmap key where the value to increment is stored.
   * @param path The property path to increment, if the value is an object or array.
   * @example
   * // Assuming
   * points.set("number", 42);
   * points.set("numberInObject", {sub: { anInt: 5 }});
   *
   * points.inc("number"); // 43
   * points.inc("numberInObject", "sub.anInt"); // {sub: { anInt: 6 }}
   */
  inc(key: string, path: string): EnhancedMap<V>  {
    this._check(key, 'Number', path);
    if (isNil(path)) {
      let val = this.get(key);
      return this._internalSet(key, ++val);
    } else {
      const data = this.get(key);
      let propValue = _get(data, path);
      _set(data, path, ++propValue);
      return this._internalSet(key, data);
    }
  }

  /**
   * Decrements a key's value or property by 1. Value must be a number, or a path to a number.
   * @param key The enmap key where the value to decrement is stored.
   * @param path The property path to decrement, if the value is an object or array.
   * @example
   * // Assuming
   * points.set("number", 42);
   * points.set("numberInObject", {sub: { anInt: 5 }});
   *
   * points.dec("number"); // 41
   * points.dec("numberInObject", "sub.anInt"); // {sub: { anInt: 4 }}
   */
  dec(key: string, path?: string): EnhancedMap<V> {
    this._check(key, 'Number', path);
    if (isNil(path)) {
      let val = this.get(key);
      return this._internalSet(key, --val);
    } else {
      const data = this.get(key);
      let propValue = _get(data, path);
      _set(data, path, --propValue);
      return this._internalSet(key, data);
    }
  }

  /**
   * Returns whether or not the key exists in the Enmap.
   * @param key Required. The key of the element to add to The Enmap or array.
   * This value MUST be a string or number.
   * @param path The property to verify inside the value object or array.
   * Can be a path with dot notation, such as "prop1.subprop2.subprop3"
   * @example
   * if(enmap.has("myKey")) {
   *   // key is there
   * }
   *
   * if(!enmap.has("myOtherKey", "oneProp.otherProp.SubProp")) return false;
   */
  has(key: string, path?: string): boolean {
    this._readyCheck();
    this._fetchCheck(key);
    key = key.toString();
    if (!isNil(path)) {
      this._check(key, 'Object');
      const data = this.get(key);
      return _has(data, path);
    }
    return super.has(key);
  }

  /**
   * Performs Array.includes() on a certain enmap value. Works similar to
   * [Array.includes()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/includes).
   * @param key Required. The key of the array to check the value of.
   * @param val Required. The value to check whether it's in the array.
   * @param path Required. The property to access the array inside the value object or array.
   * Can be a path with dot notation, such as "prop1.subprop2.subprop3"
   * @return Whether the array contains the value.
   */
  includes(key: string, val: string | number, path: string): boolean {
    this._readyCheck();
    this._fetchCheck(key);
    this._check(key, ['Array', 'Object']);
    const data = this.get(key);
    if (!isNil(path)) {
      const propValue = _get(data, path);
      if (Array.isArray(propValue)) {
        return propValue.includes(val);
      }

      throw new EnhancedMapTypeError(
        `The property "${path}" in key "${key}" is not an Array in the enmap "${
          this.name
        }" (property was of type "${propValue && propValue.constructor.name}")`,
      );
    } else if (Array.isArray(data)) {
      return data.includes(val);
    }

    throw new EnhancedMapTypeError(
      `The value of key "${key}" is not an Array in the enmap "${
        this.name
      }" (value was of type "${data && data.constructor.name}")`,
    );
  }

  /**
   * Deletes a key in the Enmap.
   * @param key Required. The key of the element to delete from The Enmap.
   * @param path The name of the property to remove from the object.
   * Can be a path with dot notation, such as "prop1.subprop2.subprop3"
   * @returns The enmap.
   */
  delete(key: string, path?: string): EnhancedMap<V> {
    this._readyCheck();
    this._fetchCheck(key);
    key = key.toString();
    const oldValue = this.get(key);
    if (!isNil(path)) {
      let data = this.get(key);
      path = toPath(path);
      const last = path.pop();
      const propValue = path.length ? _get(data, path) : data;
      if (isArray(propValue)) {
        propValue.splice(last, 1);
      } else {
        delete propValue[last];
      }
      if (path.length) {
        _set(data, path, propValue);
      } else {
        data = propValue;
      }
      this.set(key, data);
    } else {
      super.delete(key);
      if (this.persistent) {
        this.db.prepare(`DELETE FROM ${this.name} WHERE key = ?`).run(key);
        return this;
      }
      if (typeof this.changedCB === 'function') {
        this.changedCB(key, oldValue, null);
      }
    }
    return this;
  }

  /**
   * Deletes everything from the enmap. If persistent, clears the database of all its data for this table.
   */
  deleteAll() {
    this._readyCheck();
    if (this.persistent) {
      this.db?.prepare(`DELETE FROM ${this.name};`).run();
    }
    super.clear();
  }

  /**
   * Deletes everything from the enmap. If persistent, clears the database of all its data for this table.
   */
  clear() {
    return this.deleteAll();
  }

  /**
   * Completely destroys the entire enmap. This deletes the database tables entirely.
   * It will not affect other enmap data in the same database, however.
   * THIS ACTION WILL DESTROY YOUR DATA AND CANNOT BE UNDONE.
   */
  destroy() {
    this.deleteAll();

    this.isDestroyed = true;

    const transaction = this.db?.transaction((run) => {
      for (const stmt of run) {
        this.db?.prepare(stmt).run();
      }
    });

    transaction([
      `DROP TABLE IF EXISTS ${this.name};`,
      `DROP TABLE IF EXISTS 'internal::changes::${this.name}';`,
      `DELETE FROM 'internal::autonum' WHERE enmap = '${this.name}';`,
    ]);
  }

  /**
   * Remove a value in an Array or Object element in Enmap. Note that this only works for
   * values, not keys. Note that only one value is removed, no more. Arrays of objects must use a function to remove,
   * as full object matching is not supported.
   * @param key Required. The key of the element to remove from in Enmap.
   * This value MUST be a string or number.
   * @param val Required. The value to remove from the array or object. OR a function to match an object.
   * If using a function, the function provides the object value and must return a boolean that's true for the object you want to remove.
   * @param path Optional. The name of the array property to remove from.
   * Can be a path with dot notation, such as "prop1.subprop2.subprop3".
   * If not presents, removes directly from the value.
   * @example
   * // Assuming
   * enmap.set('array', [1, 2, 3])
   * enmap.set('objectarray', [{ a: 1, b: 2, c: 3 }, { d: 4, e: 5, f: 6 }])
   *
   * enmap.remove('array', 1); // value is now [2, 3]
   * enmap.remove('objectarray', (value) => value.e === 5); // value is now [{ a: 1, b: 2, c: 3 }]
   * @returns
   */
  remove(key: string, val: any | (() => boolean), path?: string) {
    this._readyCheck();
    this._fetchCheck(key);
    this._check(key, ['Array', 'Object']);
    const data = this.get(key, path);
    const criteria = isFunction(val) ? val : (value) => val === value;
    const index = data.findIndex(criteria);
    if (index > -1) {
      data.splice(index, 1);
    }
    return this.set(key, data, path);
  }

  /**
   * Exports the enmap data to a JSON file.
   * **__WARNING__**: Does not work on memory enmaps containing complex data!
   * @returns {string} The enmap data in a stringified JSON format.
   */
  export() {
    this._readyCheck();
    if (this.persistent) this.fetchEverything();
    return serialize(
      {
        name: this.name,
        version: pkgdata.version,
        exportDate: Date.now(),
        keys: this.map((value, key) => ({ key, value })),
      },
      null,
      2,
    );
  }

  /**
   * Import an existing json export from enmap from a string. This data must have been exported from enmap,
   * and must be from a version that's equivalent or lower than where you're importing it.
   * @param data The data to import to Enmap. Must contain all the required fields provided by export()
   * @param overwrite Defaults to `true`. Whether to overwrite existing key/value data with incoming imported data
   * @param clear Defaults to `false`. Whether to clear the enmap of all data before importing
   * (**__WARNING__**: Any exiting data will be lost! This cannot be undone.)
   */
  import(data: string, overwrite = true, clear = false) {
    this._readyCheck();
    if (clear) this.deleteAll();
    if (isNil(data))
      throw new EnhancedMapImportError(
        `No data provided for import() in ${this._escapeSQL(this.name)}`,
      );
    try {
      const parsed = eval(`(${data})`);
      for (const thisEntry of parsed.keys) {
        const { key, value } = thisEntry;
        if (!overwrite && this.has(key)) continue;
        this._internalSet(key, value);
      }
    } catch (err) {
      throw new EnhancedMapImportError(
        `Data provided for import() in "${this.name}" is invalid JSON. Stacktrace:\n${err}`,
      );
    }
    return this;
  }

  /**
   * Initialize multiple Enmaps easily.
   * @param names Array of strings. Each array entry will create a separate enmap with that name.
   * @param {Object} options Options object to pass to each enmap, excluding the name..
   * @example
   * // Using local variables.
   * const Enmap = require('enmap');
   * const { settings, tags, blacklist } = Enmap.multi(['settings', 'tags', 'blacklist']);
   *
   * // Attaching to an existing object (for instance some API's client)
   * const Enmap = require("enmap");
   * Object.assign(client, Enmap.multi(["settings", "tags", "blacklist"]));
   */
  static multi<V>(
    names: string[],
    options: Exclude<EnmapOptions<V>, 'name'> = {},
  ) {
    if (!names.length || names.length < 1) {
      throw new EnhancedMapTypeError(
        '"names" argument must be an array of string names.',
      );
    }

    const returnvalue: Record<string, EnhancedMap<V>> = {};
    for (const name of names) {
      returnvalue[name] = new EnhancedMap({ name, ...options });
    }
    return returnvalue;
  }

  /**
   * Initializes the enmap depending on given values.
   * @param database In order to set data to the Enmap, one must be provided.
   * @returns Returns the defer promise to await the ready state.
   */
  private _init(database: SqliteDatabase) {
    Object.defineProperty(this, 'db', {
      value: database,
      writable: false,
      enumerable: false,
      configurable: false,
    });
    if (!this.db) {
      throw new EnhancedMapDatabaseConnectionError(
        'Database Could Not Be Opened',
      );
    }
    const table = this.db
      .prepare(
        "SELECT count(*) FROM sqlite_master WHERE type='table' AND name = ?;",
      )
      .get(this.name);
    if (!table.count) {
      this.db
        .prepare(`CREATE TABLE ${this.name} (key text PRIMARY KEY, value text)`)
        .run();
      this.db.pragma('synchronous = 1');
      if (this.wal) this.db.pragma('journal_mode = wal');
    }
    this.db
      .prepare(
        `CREATE TABLE IF NOT EXISTS 'internal::changes::${this.name}' (type TEXT, key TEXT, value TEXT, timestamp INTEGER, pid INTEGER);`,
      )
      .run();
    this.db
      .prepare(
        `CREATE TABLE IF NOT EXISTS 'internal::autonum' (enmap TEXT PRIMARY KEY, lastnum INTEGER)`,
      )
      .run();

    if (this.fetchAll) {
      this.fetchEverything();
    }
    // TEMPORARY MIGRATE CODE FOR AUTONUM
    // REMOVE FOR V6
    if (this.has('internal::autonum')) {
      this.db
        .prepare(
          "INSERT OR REPLACE INTO 'internal::autonum' (enmap, lastnum) VALUES (?, ?)",
        )
        .run(this.name, this.get('internal::autonum'));
      this.delete('internal::autonum');
    } else {
      const row = this.db
        .prepare("SELECT lastnum FROM 'internal::autonum' WHERE enmap = ?")
        .get(this.name);
      if (!row) {
        this.db
          .prepare(
            "INSERT INTO 'internal::autonum' (enmap, lastnum) VALUES (?, ?)",
          )
          .run(this.name, 0);
      }
    }

    return this.defer;
  }

  private _escapeSQL(value: unknown) {
    return '"' + String(value).replace(/"/g, '""') + '"';
  }

  /**
   * Verify the type of a key or property.
   * @param key The key of the element to check.
   * @param type The javascript constructor to check.
   * @param path The dotProp path to the property in the object enmap.
   */
  private _check(key: string, type: string | string[], path?: string) {
    key = key.toString();
    if (!this.has(key))
      throw new EnhancedMapPathError(
        `The key "${key}" does not exist in the enmap "${this.name}"`,
      );
    if (!type) return;
    const types = Array.isArray(type) ? type : [type];
    if (!isNil(path)) {
      this._check(key, 'Object');
      const data = this.get(key);
      if (isNil(_get(data, path)))
        throw new EnhancedMapPathError(
          `The property "${path}" in key "${key}" does not exist. Please set() it."`,
        );
      if (!types.includes(_get(data, path).constructor.name)) {
        throw new EnhancedMapKeyTypeError(
          `The property "${path}" in key "${key}" is not of type "${types.join(
            '" or "',
          )}" in the enmap "${this.name}" 
(key was of type "${_get(data, path).constructor.name}")`,
        );
      }
    } else if (!types.includes(this.get(key)?.constructor.name)) {
      throw new EnhancedMapKeyTypeError(
        `The value for key "${key}" is not of type "${types.join(
          '" or "',
        )}" in the enmap "${this.name}" (value was of type "${
          this.get(key)?.constructor.name
        }")`,
      );
    }
  }

  /**
   * INTERNAL method to execute a mathematical operation.
   * @param {number} base the lefthand operand.
   * @param {string} op the operation.
   * @param {number} opand the righthand operand.
   * @return {number} the result.
   */
  private _mathop(
    base: number,
    op: MathOps | 'rand' | 'random',
    opand: number,
  ) {
    if (base == undefined || op == undefined || opand == undefined)
      throw new EnhancedMapTypeError(
        'Math Operation requires base and operation',
      );
    switch (op) {
      case 'add':
      case 'addition':
      case '+':
        return base + opand;
      case 'sub':
      case 'subtract':
      case '-':
        return base - opand;
      case 'mult':
      case 'multiply':
      case '*':
        return base * opand;
      case 'div':
      case 'divide':
      case '/':
        return base / opand;
      case 'exp':
      case 'exponent':
      case '^':
        return Math.pow(base, opand);
      case 'mod':
      case 'modulo':
      case '%':
        return base % opand;
      case 'rand':
      case 'random':
        return Math.floor(Math.random() * Math.floor(opand));
    }
  }

  /**
   * Internal method used to validate persistent enmap names (valid Windows filenames)
   * @private
   */
  private _validateName() {
    this.name = this.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  }

  /**
   * Verifies if a key needs to be fetched from the database.
   * If persistent enmap and autoFetch is on, retrieves the key.
   * @param {string} key The key to check or fetch.
   */
  private _fetchCheck(key: string, force = false) {
    key = key.toString();
    if (!['String', 'Number'].includes(key.constructor.name)) return;
    if (force) {
      this.fetch(key);
      return;
    }
    if (super.has(key)) return;
    if (!this.persistent || !this.autoFetch) return;
    this.fetch(key);
  }

  /**
   * Parses JSON data.
   * Reserved for future use (logical checking)
   * @param {*} data The data to check/parse
   * @returns {*} An object or the original data.
   */
  private _parseData(data, key) {
    return this.deserializer(eval(`(${data})`), key);
  }

  /**
   * Clones a value or object with the enmap's set clone level.
   * @param {*} data The data to clone.
   * @return {*} The cloned value.
   */
  private _clone<T>(data: T): T {
    if (this.cloneLevel === 'none') return data;
    if (this.cloneLevel === 'shallow') return clone(data);
    if (this.cloneLevel === 'deep') return cloneDeep(data);
    throw new EnhancedMapOptionsError(
      "Invalid cloneLevel. What did you *do*, this shouldn't happen!",
    );
  }

  /**
   * Verifies that the database is ready, assuming persistence is used.
   */
  private _readyCheck() {
    if (this.isDestroyed)
      throw new EnhancedMapDestroyedError(
        'This enmap has been destroyed and can no longer be used without being re-initialized.',
      );
  }

  /**
   * Sets data without looking at cache, fetching, or anything else. Used when fetch/ready checks are already made.
   */
  private _internalSet(key: string, value, updateCache = true) {
    if (this.persistent) {
      let serialized;
      try {
        serialized = serialize(this.serializer(value, key));
      } catch (e) {
        serialized = serialize(this.serializer(onChange.target(value), key));
      }
      this.db
        ?.prepare(
          `INSERT OR REPLACE INTO ${this.name} (key, value) VALUES (?, ?);`,
        )
        .run(key, serialized);
    }
    if (updateCache) super.set(key, value);
    return this;
  }

  /**
  BELOW IS DISCORD.JS COLLECTION CODE
  Per notes in the LICENSE file, this project contains code from Amish Shah's Discord.js
  library. The code is from the Collections object, in discord.js version 11.

  All below code is sourced from Collections.
  https://github.com/discordjs/collection
  */

  /**
   * Creates an ordered array of the values of this Enmap.
   * The array will only be reconstructed if an item is added to or removed from the Enmap,
   * or if you change the length of the array itself. If you don't want this caching behaviour,
   * use `Array.from(enmap.values())` instead.
   */
  array() {
    return Array.from(this.values());
  }

  /**
   * Creates an ordered array of the keys of this Enmap
   * The array will only be reconstructed if an item is added to or removed from the Enmap,
   * or if you change the length of the array itself. If you don't want this caching behaviour,
   * use `Array.from(enmap.keys())` instead.
   */
  keyArray() {
    return Array.from(this.keys());
  }

  /**
   * Obtains random value(s) from this Enmap.
   * @param count Number of values to obtain randomly.
   * @returns The single value if `count` is undefined, or an array of values of `count` length.
   */
  random(count = 1) {
    const items = this.array();
    if (!count) return items[Math.floor(Math.random() * items.length)];
    if (typeof count !== 'number')
      throw new TypeError('The count must be a number.');
    if (!Number.isInteger(count) || count < 1)
      throw new RangeError('The count must be an integer greater than 0.');
    if (items.length === 0) return [];
    return Array.from(
      { length: count },
      () => items.splice(Math.floor(Math.random() * items.length), 1)[0],
    );
  }

  /**
   * Obtains random key(s) from this Enmap.
   * @param count Number of keys to obtain randomly
   * @returns The single key if `count` is undefined, or an array of keys of `count` length
   */
  randomKey(count = 1) {
    const items = this.keyArray();
    if (!count) return items[Math.floor(Math.random() * items.length)];
    if (typeof count !== 'number')
      throw new TypeError('The count must be a number.');
    if (!Number.isInteger(count) || count < 1)
      throw new RangeError('The count must be an integer greater than 0.');
    if (items.length === 0) return [];
    return Array.from(
      { length: count },
      () => items.splice(Math.floor(Math.random() * items.length), 1)[0],
    );
  }

  /**
   * Searches for all items where their specified property's value is identical to the given value (`item[prop] === value`).
   * @param prop The property to test against
   * @param {*} value The expected value
   * @example
   * enmap.findAll('username', 'Bob');
   */
  findAll(prop: string, value) {
    if (typeof prop !== 'string') throw new TypeError('Key must be a string.');
    if (isNil(value)) throw new EnhancedMapError('Value must be specified.');
    const results = [];
    for (const item of this.values()) {
      if (
        item[prop] === value ||
        (isObject(item) && _get(item, prop) === value)
      )
        results.push(item);
    }
    return results;
  }

  /**
   * Searches for a single item where its specified property's value is identical to the given value
   * (`item[prop] === value`), or the given function returns a truthy value. In the latter case, this is identical to
   * [Array.find()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/find).
   * <warn>All Enmap used in Discord.js are mapped using their `id` property, and if you want to find by id you
   * should use the `get` method. See
   * [MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/get) for details.</warn>
   * @param {string|Function} propOrFn The property to test against, or the function to test with
   * @param {*} [value] The expected value - only applicable and required if using a property for the first argument
   * @returns {*}
   * @example
   * enmap.find('username', 'Bob');
   * @example
   * enmap.find(val => val.username === 'Bob');
   */
  find(propOrFn, value) {
    this._readyCheck();
    if (isNil(propOrFn) || (!isFunction(propOrFn) && isNil(value))) {
      throw new EnhancedMapArgumentError(
        'find requires either a prop and value, or a function. One of the provided arguments was null or undefined',
      );
    }
    const func = isFunction(propOrFn)
      ? propOrFn
      : (v) => value === _get(v, propOrFn);
    for (const [key, val] of this) {
      if (func(val, key, this)) return val;
    }
    return null;
  }

  /**
   * Searches for the key of a single item where its specified property's value is identical to the given value
   * (`item[prop] === value`), or the given function returns a truthy value. In the latter case, this is identical to
   * [Array.findIndex()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/findIndex).
   * @param {string|Function} propOrFn The property to test against, or the function to test with
   * @param {*} [value] The expected value - only applicable and required if using a property for the first argument
   * @returns {string|number}
   * @example
   * enmap.findKey('username', 'Bob');
   * @example
   * enmap.findKey(val => val.username === 'Bob');
   */
  findKey(propOrFn, value) {
    this._readyCheck();
    if (typeof propOrFn === 'string') {
      if (isNil(value)) throw new EnhancedMapError('Value must be specified.');
      for (const [key, val] of this) {
        if (
          val[propOrFn] === value ||
          (isObject(val) && _get(val, propOrFn) === value)
        )
          return key;
      }
      return null;
    } else if (typeof propOrFn === 'function') {
      for (const [key, val] of this) {
        if (propOrFn(val, key, this)) return key;
      }
      return null;
    }
    throw new EnhancedMapError(
      'First argument must be a property string or a function.',
    );
  }

  /**
   * Removes entries that satisfy the provided filter function.
   * @param {Function} fn Function used to test (should return a boolean)
   * @param {Object} [thisArg] Value to use as `this` when executing function
   * @returns {number} The number of removed entries
   */
  sweep(fn, thisArg) {
    this._readyCheck();
    if (thisArg) fn = fn.bind(thisArg);
    const previousSize = this.size;
    for (const [key, val] of this) {
      if (fn(val, key, this)) this.delete(key);
    }
    return previousSize - this.size;
  }

  /**
   * Identical to
   * [Array.filter()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/filter),
   * but returns a Enmap instead of an Array.
   * @param {Function} fn Function used to test (should return a boolean)
   * @param {Object} [thisArg] Value to use as `this` when executing function
   * @returns {EnhancedMap}
   */
  filter(fn, thisArg) {
    this._readyCheck();
    if (thisArg) fn = fn.bind(thisArg);
    const results = new EnhancedMap(this.name);
    for (const [key, val] of this) {
      if (fn(val, key, this)) results.set(key, val);
    }
    return results;
  }

  /**
   * Identical to
   * [Array.filter()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/filter).
   * @param {Function} fn Function used to test (should return a boolean)
   * @param {Object} [thisArg] Value to use as `this` when executing function
   * @returns {Array}
   */
  filterArray(fn, thisArg: this) {
    this._readyCheck();
    if (thisArg) fn = fn.bind(thisArg);
    const results = [];
    for (const [key, val] of this) {
      if (fn(val, key, this)) results.push(val);
    }
    return results;
  }

  /**
   * Identical to
   * [Array.map()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map).
   * @param {Function} fn Function that produces an element of the new array, taking three arguments
   * @param {*} [thisArg] Value to use as `this` when executing function
   */
  map(fn, thisArg: this) {
    this._readyCheck();
    if (thisArg) fn = fn.bind(thisArg);
    const arr = new Array(this.size);
    let i = 0;
    for (const [key, val] of this) arr[i++] = fn(val, key, this);
    return arr;
  }

  /**
   * Identical to
   * [Array.some()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/some).
   * @param {Function} fn Function used to test (should return a boolean)
   * @param {Object} [thisArg] Value to use as `this` when executing function
   */
  some(fn, thisArg: this): boolean {
    this._readyCheck();
    if (thisArg) fn = fn.bind(thisArg);
    for (const [key, val] of this) {
      if (fn(val, key, this)) return true;
    }
    return false;
  }

  /**
   * Identical to
   * [Array.every()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/every).
   * @param {Function} fn Function used to test (should return a boolean)
   * @param {Object} [thisArg] Value to use as `this` when executing function
   */
  every(fn, thisArg: this): boolean {
    this._readyCheck();
    if (thisArg) fn = fn.bind(thisArg);
    for (const [key, val] of this) {
      if (!fn(val, key, this)) return false;
    }
    return true;
  }

  /**
   * Identical to
   * [Array.reduce()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/reduce).
   * @param {Function} fn Function used to reduce, taking four arguments; `accumulator`, `currentValue`, `currentKey`,
   * and `enmap`
   * @param {*} [initialValue] Starting value for the accumulator
   */
  reduce(fn, initialValue) {
    this._readyCheck();
    let accumulator;
    if (typeof initialValue !== 'undefined') {
      accumulator = initialValue;
      for (const [key, val] of this)
        accumulator = fn(accumulator, val, key, this);
    } else {
      let first = true;
      for (const [key, val] of this) {
        if (first) {
          accumulator = val;
          first = false;
          continue;
        }
        accumulator = fn(accumulator, val, key, this);
      }
    }
    return accumulator;
  }
}
