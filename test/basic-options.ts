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

test.beforeEach((t) => {
  t.context.baseObj = {
    prop1: false,
    prop2: 'thing',
    prop3: [1, 2, 3],
    obj: { thing: 'amajig' },
  };
});

test.afterEach((t) => {
  t.context.enmap.clear();
  t.context.enmap = null;
});

test('supports direct passing by reference (cloneLevel none)', (t) => {
  t.context.enmap = new EnhancedMap({ name: '::memory::', cloneLevel: 'none' });
  t.context.enmap.set('foo', t.context.baseObj);
  t.context.enmap.set('foo', 'other', 'prop2');
  t.context.enmap.push('foo', 4, 'prop3');

  // by reference modifies object properties at any level.
  t.is(t.context.baseObj.prop2, 'other');
  t.is(t.context.baseObj.prop3.length, 4);
});

test('supports shallow clones', (t) => {
  t.context.enmap = new EnhancedMap({
    name: '::memory::',
    cloneLevel: 'shallow',
  });
  t.context.enmap.set('foo', t.context.baseObj);
  t.context.enmap.set('foo', 'other', 'prop2');
  t.context.enmap.push('foo', 4, 'prop3');
  // shallow clones do not allow base props to change in referenced object
  t.is(t.context.baseObj.prop2, 'thing');
  // shallow clones still allow subprops to be modified, though.
  t.is(t.context.baseObj.prop3.length, 4);
});

test('supports deep clones', (t) => {
  t.context.enmap = new EnhancedMap({ name: '::memory::', cloneLevel: 'deep' });
  t.context.enmap.set('foo', t.context.baseObj);
  t.context.enmap.set('foo', 'other', 'prop2');
  t.context.enmap.push('foo', 4, 'prop3');
  // deep clones do not allow base props to change in referenced object
  t.is(t.context.baseObj.prop2, 'thing');
  // deep clones do not allow sub props to be changed, either.
  t.is(t.context.baseObj.prop3.length, 3);
});

test('supports deep ensure() merge', (t) => {
  t.context.enmap = new EnhancedMap({ name: '::memory::', ensureProps: true });
  const defaultValue = {
    foo: 'bar',
    bar: { foo: 1 },
  };
  t.context.enmap.set('obj', {});
  t.context.enmap.ensure('obj', defaultValue);
  t.is(t.context.enmap.get('obj', 'bar.foo'), 1);
});
