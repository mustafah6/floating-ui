import {useCallback} from 'react';
import {useLatestRef} from './useLatestRef';

type AnyFunction = (...args: any) => any;

export function useEvent<T extends AnyFunction>(
  callback: T | undefined | null
) {
  const ref = useLatestRef(callback);
  return useCallback((...args: any[]) => ref.current?.(...args), [ref]) as T;
}
