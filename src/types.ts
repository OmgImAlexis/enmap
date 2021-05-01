/**
 * see #54
 */
export type Path<T, Key extends keyof T = keyof T> = Key extends string
 ? T[Key] extends Record<string, any>
   ?
       | `${Key}.${Path<T[Key], Exclude<keyof T[Key], keyof any[]>> & string}`
       | `${Key}.${Exclude<keyof T[Key], keyof any[]> & string}`
       | Key
   : never
 : never;

export type PathValue<T, P extends Path<T>> = P extends `${infer Key}.${infer Rest}`
 ? Key extends keyof T
   ? Rest extends Path<T[Key]>
     ? PathValue<T[Key], Rest>
     : never
   : never
 : P extends keyof T
 ? T[P]
 : never;

export type MathOps =
 | 'add'
 | 'addition'
 | '+'
 | 'sub'
 | 'subtract'
 | '-'
 | 'mult'
 | 'multiply'
 | '*'
 | 'div'
 | 'divide'
 | '/'
 | 'exp'
 | 'exponent'
 | '^'
 | 'mod'
 | 'modulo'
 | '%';