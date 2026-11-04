import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { RegionHost, RegionRegistry } from '../src/client/region'

const context = { workspace: { workspaceId: 'w1', path: '/remote/project', title: 'Remote project' } }

describe('RegionRegistry', () => {
  it('selects the lowest-priority renderer and restores the next on disposal', () => {
    const registry = new RegionRegistry()
    const offDefault = registry.registerRenderer('workspace.row', { id: 'default', priority: 0 }, () => null)
    registry.registerRenderer('workspace.row', { id: 'replacement', priority: -10 }, () => null)
    expect(registry.snapshot('workspace.row').renderer?.id).toBe('replacement')
    const offReplacement = registry.registerRenderer('workspace.row', { id: 'third', priority: -20 }, () => null)
    expect(registry.snapshot('workspace.row').renderer?.id).toBe('third')
    offReplacement()
    expect(registry.snapshot('workspace.row').renderer?.id).toBe('replacement')
    offDefault()
    expect(registry.snapshot('workspace.row').renderer?.id).toBe('replacement')
  })

  it('rejects equal-priority renderer replacement', () => {
    const registry = new RegionRegistry()
    registry.registerRenderer('workspace.row', { id: 'default', priority: 0 }, () => null)
    expect(() => registry.registerRenderer('workspace.row', { id: 'other', priority: 0 }, () => null)).toThrow(/priority/)
  })

  it('publishes renderer arrival and departure so native outlets can restore the official UI', () => {
    const registry = new RegionRegistry()
    let changes = 0
    const unsubscribe = registry.subscribe(() => { changes += 1 })
    const off = registry.registerRenderer('workspace.directoryFlow', { id: 'mesh', priority: 0 }, () => null)
    expect(changes).toBe(1)
    off()
    off()
    expect(changes).toBe(2)
    unsubscribe()
  })

  it('marks a region occupied for every contribution kind', () => {
    const registry = new RegionRegistry()
    expect(registry.snapshot('workspace.directoryFlow').occupied).toBe(false)
    const off = registry.registerContribution('workspace.directoryFlow', { id: 'mesh' }, () => null)
    expect(registry.snapshot('workspace.directoryFlow').occupied).toBe(true)
    off()
    expect(registry.snapshot('workspace.directoryFlow').occupied).toBe(false)
  })
})

describe('RegionHost', () => {
  it('composes ordered decorators around the renderer and contributions', () => {
    const registry = new RegionRegistry()
    registry.registerRenderer('workspace.row', { id: 'default', priority: 0 }, ({ context }) => <span>row:{context.workspace.title}</span>)
    registry.registerDecorator('workspace.row', { id: 'outer', order: 10 }, ({ next }) => <main>outer[{next()}]</main>)
    registry.registerDecorator('workspace.row', { id: 'inner', order: 20 }, ({ next }) => <section>inner[{next()}]</section>)
    registry.registerContribution('workspace.row', { id: 'second', order: 20 }, () => <i>second</i>)
    const offFirst = registry.registerContribution('workspace.row', { id: 'first', order: 10 }, () => <i>first</i>)
    const html = renderToStaticMarkup(<RegionHost registry={registry} name="workspace.row" context={context} />)
    expect(html.indexOf('outer')).toBeLessThan(html.indexOf('inner'))
    expect(html.indexOf('inner')).toBeLessThan(html.indexOf('row:'))
    expect(html.indexOf('first')).toBeLessThan(html.indexOf('second'))
    expect(html).toContain('Remote project')
    offFirst()
    expect(renderToStaticMarkup(<RegionHost registry={registry} name="workspace.row" context={context} />)).not.toContain('first')
  })
})
