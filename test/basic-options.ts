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

test('supports deep clones by default', (t) => {
  t.context.enmap = new EnhancedMap({ name: '::memory::' });
  t.context.enmap.set('foo', t.context.baseObj);
  t.context.enmap.set('foo', 'other', 'prop2');
  t.context.enmap.push('foo', 4, 'prop3');
  // deep clones do not allow base props to change in referenced object
  t.is(t.context.baseObj.prop2, 'thing');
  // deep clones do not allow sub props to be changed, either.
  t.is(t.context.baseObj.prop3.length, 3);
});
