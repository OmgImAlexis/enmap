import anyTest, { TestInterface } from 'ava';
import { EnhancedMap } from '../src';

interface Context {
  enmap: EnhancedMap<any>;
}

const test = anyTest as TestInterface<Context>;

test.beforeEach((t) => {
  t.context.enmap = new EnhancedMap('::memory::');
  t.context.enmap.set('obj1', {
    prop: 'prop',
    foo: 'bar',
    sub: { value: 'subvalue' },
  });
  t.context.enmap.set('obj2', {
    prop: 'prop',
    foo: 'phar',
    sub: { value: 'subvalue' },
  });
  t.context.enmap.set('arr1', ['one', 'two', 3, 4]);
});

test.serial('can findAll using both properties and path', (t) => {
  const enmap = t.context.enmap;
  t.is(enmap.findAll('prop', 'prop').length, 2);
  t.is(enmap.findAll('sub.value', 'subvalue').length, 2);
});

test.serial('can find using both properties and path', (t) => {
  const enmap = t.context.enmap;
  t.deepEqual(enmap.find('sub.value', 'subvalue'), {
    prop: 'prop',
    foo: 'bar',
    sub: { value: 'subvalue' },
  });
});
