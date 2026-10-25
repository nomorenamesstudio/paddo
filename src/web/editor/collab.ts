import * as Y from 'yjs'
import { HocuspocusProvider } from '@hocuspocus/provider'

import { websocketUrl } from '../api'

export interface Collab {
  doc: Y.Doc
  provider: HocuspocusProvider
  destroy: () => void
}

/**
 * One Y.Doc per open document. The server loads its content (sidecar first,
 * markdown second) before the first sync, so the client never parses markdown.
 */
export function createCollab(slug: string): Collab {
  const doc = new Y.Doc()
  const provider = new HocuspocusProvider({
    url: websocketUrl(),
    name: slug,
    document: doc,
  })

  return {
    doc,
    provider,
    destroy() {
      provider.destroy()
      doc.destroy()
    },
  }
}
