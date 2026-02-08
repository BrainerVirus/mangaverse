import { useEffect, useMemo, useRef, useState } from "react"

export function useDebouncedValue<T>(value: T, delayMs: number) {
	const [debounced, setDebounced] = useState(value)
	useEffect(() => {
		const handle = setTimeout(() => setDebounced(value), delayMs)
		return () => clearTimeout(handle)
	}, [value, delayMs])
	return debounced
}

export function useStableCallback<T extends (...args: never[]) => void>(callback: T) {
	const callbackRef = useRef(callback)
	useEffect(() => {
		callbackRef.current = callback
	})
	return useMemo(() => ((...args: Parameters<T>) => callbackRef.current(...args)) as T, [])
}
