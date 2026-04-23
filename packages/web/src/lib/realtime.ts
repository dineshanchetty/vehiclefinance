/**
 * realtime.ts — reusable Supabase Realtime hook.
 * Subscribes to INSERT events on a table (with optional filter),
 * calls onInsert for each new row, and cleans up on unmount.
 */
import { useEffect, useRef } from 'react'
import { supabase } from './supabase'

export interface RealtimeFilter {
  column: string
  value: string
}

export function useRealtimeTable<T>(
  table: string,
  filter: RealtimeFilter | undefined,
  onInsert: (row: T) => void,
): void {
  // Keep a stable ref to onInsert to avoid re-subscribing on every render
  const onInsertRef = useRef(onInsert)
  useEffect(() => {
    onInsertRef.current = onInsert
  })

  useEffect(() => {
    const channelName = filter
      ? `realtime:${table}:${filter.column}:${filter.value}`
      : `realtime:${table}`

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table,
          ...(filter ? { filter: `${filter.column}=eq.${filter.value}` } : {}),
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: { new: any }) => {
          onInsertRef.current(payload.new as T)
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [table, filter?.column, filter?.value]) // eslint-disable-line react-hooks/exhaustive-deps
}
