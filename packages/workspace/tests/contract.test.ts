import { expect, it } from 'vitest'
// Source-level pin: client bundles must not import each other at runtime, so the
// literal is duplicated. This test is the thing that keeps the copy honest.
import { DIRECTORY_FLOW_REGION as ADAPTER_REGION, DIRECTORY_FLOW_SLOTS } from '../../adapter-dsh/src/client/index'
import { DIRECTORY_FLOW_REGION } from '../src/client/index'

it('keeps the domain region key pinned to the adapter export', () => {
  expect(DIRECTORY_FLOW_REGION).toBe(ADAPTER_REGION)
})

it('covers both shipped directory-flow seats', () => {
  expect([...DIRECTORY_FLOW_SLOTS]).toEqual([
    'sidebar.workspaces.directoryFlow',
    'conversation.hero.workspace.directoryFlow',
  ])
})
