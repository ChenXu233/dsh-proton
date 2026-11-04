// @vitest-environment jsdom
import { useEffect } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import type { StoredEntry } from '@deepseek-ai/dsh-client-ui-slots'
import { OriginalSlotEntry } from '../src/client/original'

afterEach(() => cleanup())

it('remounts a shared component when the StoredEntry registration identity changes', () => {
  const events: string[] = []
  const Flow = ({ label }: { label: string }) => {
    useEffect(() => {
      events.push(`mount:${label}`)
      return () => { events.push(`unmount:${label}`) }
    }, [])
    return <span>original:{label}</span>
  }
  const entry = (label: string) => ({ component: Flow, inject: () => ({ label }) }) as unknown as StoredEntry
  const view = render(<OriginalSlotEntry entry={entry('a')} owner={{}} />)
  expect(screen.getByText('original:a')).toBeTruthy()
  view.rerender(<OriginalSlotEntry entry={entry('b')} owner={{}} />)
  expect(screen.getByText('original:b')).toBeTruthy()
  expect(events).toEqual(['mount:a', 'unmount:a', 'mount:b'])
})
