import anyTest, { TestInterface } from 'ava';
import { EnhancedMap } from '../src';

interface Context {
  enmap: EnhancedMap<any>;
}

const test = anyTest as TestInterface<Context>;

test.before((t) => {
  t.context.enmap = new EnhancedMap('::memory::');
});

test.serial('inserts primitive values', (t) => {
  const enmap = t.context.enmap;
  t.not(enmap.set('simplevalue', 'this is a string'), null);
  t.not(enmap.set('boolean', true), null);
  t.not(enmap.set('integer', 42), null);
  t.not(enmap.set('null', null), null);
});

test.serial('remembers primitive values', (t) => {
  const enmap = t.context.enmap;
  t.is(enmap.get('simplevalue'), 'this is a string');
  t.is(enmap.get('boolean'), true);
  t.is(enmap.get('integer'), 42);
  t.is(enmap.get('null'), null);
});

test.serial('can do math', (t) => {
  const enmap = t.context.enmap;
  enmap.inc('integer');
  t.is(enmap.get('integer'), 43);
  enmap.math('integer', '+', 5);
  t.is(enmap.get('integer'), 48);
  enmap.dec('integer');
  t.is(enmap.get('integer'), 47);
});

test.serial('can be cleared', (t) => {
  const enmap = t.context.enmap;
  enmap.clear();
  t.is(enmap.size, 0);
});

test.serial('supports arrays', (t) => {
  const enmap = t.context.enmap;
  t.not(enmap.set('array', [1, 2, 3]), null);
  t.is(enmap.get('array').length, 3);
  t.not(
    enmap.set('objectarray', [
      { a: 1, b: 2, c: 3 },
      { d: 4, e: 5, f: 6 },
    ]),
    null,
  );
  t.is(enmap.get('objectarray').length, 2);
});

test.serial('also supports objects', (t) => {
  const enmap = t.context.enmap;
  t.not(
    enmap.set('object', { color: 'black', action: 'paint', desire: true }),
    null,
  );
  t.deepEqual(enmap.get('object'), {
    color: 'black',
    action: 'paint',
    desire: true,
  });
});

test.serial('can get an object by property name', (t) => {
  const enmap = t.context.enmap;
  t.is(enmap.get('object', 'color'), 'black');
  t.is(enmap.get('object', 'desire'), true);
  t.is(enmap.get('object', 'action'), 'paint');
});

test.serial('can set subproperties of objects', (t) => {
  const enmap = t.context.enmap;
  t.not(enmap.set('object', { sub1: 'a', sub2: [] }, 'sub'), null);
  t.is(enmap.get('object', 'sub.sub1'), 'a');
  t.is(enmap.get('object', 'sub.sub2').length, 0);
});

test.serial('can handle arrays in and out of objects', (t) => {
  const enmap = t.context.enmap;
  t.not(enmap.push('array', 4), null);
  t.is(enmap.get('array').length, 4);
  t.not(enmap.remove('array', 1), null);
  t.is(enmap.get('array').length, 3);
  t.not(
    enmap.remove('objectarray', (value) => value.e === 5),
    null,
  );
  t.is(enmap.get('objectarray').length, 1);
});

test.serial('supports simple observables', (t) => {
  const enmap = t.context.enmap;
  const obj = enmap.observe('object');
  obj.sub.sub2.push('blah');
  t.is(obj.sub.sub2[0], 'blah');
  t.is(enmap.get('object', 'sub.sub2.0'), 'blah');
});

test.serial('supports full serialized data', (t) => {
  const enmap = t.context.enmap;
  enmap.set('serialized', {
    str: 'string',
    num: 0,
    obj: { foo: 'foo' },
    arr: [1, 2, 3],
    bool: true,
    nil: null,
    undef: undefined,
    inf: Infinity,
    date: new Date('Thu, 28 Apr 2016 22:02:17 GMT'),
    map: new Map([['hello', 'world']]),
    set: new Set([123, 456]),
    fn: function echo(arg) {
      return arg;
    },
    re: /([^\s]+)/g,
    // eslint-disable-next-line no-undef
    big: BigInt(10),
  });
  t.is(enmap.get('serialized', 'undef'), undefined);
  t.is(enmap.get('serialized', 'fn')('test'), 'test');
  t.is(enmap.get('serialized', 'map').get('hello'), 'world');
});
