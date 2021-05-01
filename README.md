# Enhanced Maps

<div align="center">
  <p>
    <a href="https://www.npmjs.com/package/enhanced-map"><img src="https://img.shields.io/npm/v/enhanced-map.svg?maxAge=3600" alt="NPM version" /></a>
    <a href="https://www.npmjs.com/package/enhanced-map"><img src="https://img.shields.io/npm/dt/enhanced-map.svg?maxAge=3600" alt="NPM downloads" /></a>
  </p>
  <p>
    <a href="https://nodei.co/npm/enhanced-map/"><img src="https://nodei.co/npm/enhanced-map.png?downloads=true&stars=true" alt="npm installnfo" /></a>
  </p>
</div>

Enhanced Maps are a data structure that can be used to store data in memory that can also be saved in a database behind the scenes.
These operations are fast, safe, and painless.

The data is synchronized to the database automatically, seamlessly, and asynchronously for maximum effectiveness.
The storage system used is an `sqlite` database which is fast, performant, can be easily backed up,
and supports multiple simultaneous connections.

## Documentation

 * [Installation](#install)
 * [Basic Setup](#usage)
 * [API Reference](#api)
 * [Examples](#examples)

## Installation

```bash
npm i github:lunabot/enhanced-map#main
```

## Usage

```ts
import { EnhancedMap } from 'enhanced-map';

// Normal enhanced map with default options
const myEnhancedMap = new EnhancedMap({name: "points"});

// non-cached, auto-fetch enhanced map: 
const otherEnhancedMap = new EnhancedMap({
  name: "settings",
  autoFetch: true,
  fetchAll: false
});
```

## FAQs

### Q: So what's an enhanced map?

**A**: Enhanced maps extend the Javascript Map() data structure with additional utility methods. This started
as a pretty straight clone of the [Discord.js Collections](https://discord.js.org/#/docs/collection/master/class/Collection)
but since its creation has grown far beyond those methods alone.

### Q: What is "Persistent"?

**A**: By using a database layer with `better-sqlite3`, any data added to the enhanced map
is stored not only in temporary memory but also backed up in a local database. This means that
when you restart your project, your data is not lost and is loaded on startup.

### Q: How big can the enhanced map be?

**A**: The size of the memory used is directly proportional to the size of all the keys loaded in memory.
The more data you have, the more complex it is, the more memory it can use. You can use the
[fetchAll](https://enmap.evie.dev/usage/fetchall) options to reduce memory usage.

### Q: What's it used for?

**A**: Enhanced maps are useful for storing very simple key/value data for easy retrieval; And also for more complex objects with many properties. 
This is used in Discord.js bots to save currencies, content blocks, server settings, user information for bans, blocklists, timers, warning systems, etc.