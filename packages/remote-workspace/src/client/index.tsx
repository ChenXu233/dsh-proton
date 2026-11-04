import type { Context } from '@deepseek-ai/cordis'
import { MeshWorkspaceBridge } from './bridge'
import { RemoteWorkspaceFlow } from './RemoteWorkspaceFlow'

export const inject = ['proton']

/** Decorate the original directory flow without replacing its renderer. */
export function apply(ctx: Context): void {
  const bridge = new MeshWorkspaceBridge()
  ctx.effect(() => ctx.proton.registerDecorator(
    'workspace.directoryFlow',
    { id: 'mesh-surface', order: 100 },
    ({ context, next }) => <RemoteWorkspaceFlow context={context} bridge={bridge} next={next} />,
  ), 'proton: mesh remote workspace')
}
