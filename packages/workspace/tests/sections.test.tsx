// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { SectionRegistry, SectionsHost } from '../src/client/sections'

// Vitest's globals are off, so Testing Library does not clean up on its own:
// without this, every assertion sees the previous render as well.
afterEach(() => { cleanup() })

const order = (): (string | null)[] =>
  screen.getAllByText(/^(before|native|remote)$/).map(node => node.textContent)

it('places the shipped list among contributions by order', () => {
  const registry = new SectionRegistry()
  registry.add({ id: 'remote', order: 10, title: '远程工作区', render: () => <div>remote</div> })
  registry.add({ id: 'local-first', order: -1, render: () => <div>before</div> })
  render(<SectionsHost registry={registry} next={() => <div>native</div>} />)
  expect(order()).toEqual(['before', 'native', 'remote'])
  expect(screen.getByText('远程工作区')).toBeTruthy()
})

it('keeps the shipped list out when a contribution claims the region', () => {
  const registry = new SectionRegistry()
  registry.add({ id: 'claim', order: 5, replacesNative: true, render: () => <div>remote</div> })
  registry.add({ id: 'other', order: 6, render: () => <div>before</div> })
  render(<SectionsHost registry={registry} next={() => <div>native</div>} />)
  expect(screen.queryByText('native')).toBeNull()
  expect(screen.getByText('remote')).toBeTruthy()
})

it('isolates a failing contribution instead of taking the list down', () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  const registry = new SectionRegistry()
  registry.add({ id: 'boom', order: 1, render: () => { throw new Error('section exploded') } })
  registry.add({ id: 'remote', order: 10, render: () => <div>remote</div> })
  render(<SectionsHost registry={registry} next={() => <div>native</div>} />)
  expect(screen.getByText('native')).toBeTruthy()
  expect(screen.getByText('remote')).toBeTruthy()
  consoleError.mockRestore()
})