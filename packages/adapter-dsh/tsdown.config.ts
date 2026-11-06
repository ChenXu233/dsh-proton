import { dshPackageBuild } from '../../build/tsdown.ts'

/** The host shares its store engine; split ratios persist through it. */
export default dshPackageBuild('dsh-proton-adapter-dsh', 'src/client/index.tsx', {
  externals: ['react', 'react/jsx-runtime', '@deepseek-ai/cordis', '@deepseek-ai/dsh-client-store'],
})
