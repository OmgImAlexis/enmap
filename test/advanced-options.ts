import anyTest, { TestInterface } from 'ava';
import { EnhancedMap } from '../src';

interface Context {
  enmap: EnhancedMap<any>;
  baseObj: {
    prop1: boolean;
    prop2: string;
    prop3: [number, number, number];
    obj: {
      thing: string;
    };
  };
}

const test = anyTest as TestInterface<Context>;

const defaultData = {
  a: 1,
  b: 2,
  c: 3,
  d: [1, 2, 3, 4],
  e: { a: 'a', b: 'b', c: 'c' },
};

test.afterEach((t) => {
  t.context.enmap.close();
  t.context.enmap = null;
});

test('supports autoEnsure', (t) => {
  t.context.enmap = new EnhancedMap({
    name: '::memory::',
    default: defaultData,
  });
  t.deepEqual(t.context.enmap.get('test'), defaultData);
  t.is(t.context.enmap.size, 1);
  t.context.enmap.set('test', 'a', 'a');
  t.deepEqual(t.context.enmap.get('test'), {
    ...defaultData,
    a: 'a',
  });
  t.context.enmap.set('test2', 'b', 'b');
  t.deepEqual(t.context.enmap.get('test2'), {
    ...defaultData,
    b: 'b',
  });
});

test('supports serializers', (t) => {
  t.context.enmap = new EnhancedMap({
    name: '::memory::',
    serializer: (data, key) => ({
      ...data,
      a: 'modified',
    }),
    deserializer: (data, key) => ({
      ...data,
      a: 1,
    }),
  });
  t.context.enmap.set('test', defaultData);
  t.is(t.context.enmap.get('test', 'a'), 1);
  const data = t.context.enmap.db
    .prepare(`SELECT * FROM '__memory__' WHERE key = ?;`)
    .get('test');
  t.is(
    data.value,
    '{"a":"modified","b":2,"c":3,"d":[1,2,3,4],"e":{"a":"a","b":"b","c":"c"}}',
  );
});
