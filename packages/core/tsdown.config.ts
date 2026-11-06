import { dshPackageBuild } from '../../build/tsdown.ts'

/**
 * The host shares its store engine with every client bundle; our split ratios
 * persist through that same engine, so it must be required, never duplicated.
 */
export default dshPackageBuild('dsh-proton', 'src/client/index.ts', {
  externals: ['react', 'react/jsx-runtime', '@deepseek-ai/cordis', '@deepseek-ai/dsh-client-store'],
})
