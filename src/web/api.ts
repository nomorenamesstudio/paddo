import { mountPath, url } from './base'

export const STATUSES = ['draft', 'editing', 'published', 'archived'] as const
export type Status = (typeof STATUSES)[number]

export interface DocumentMeta {
  slug: string
  title: string
  words: number
  updatedAt: number
  bytes: number
  status: Status
  /** Suggested edits waiting for a decision. */
  pending: number
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url(path), {
    credentials: 'same-origin',
    headers: init.body ? { 'content-type': 'application/json' } : undefined,
    ...init,
  })

  if (!response.ok) {
    let message = response.statusText
    try {
      const body = (await response.json()) as { error?: string }
      if (body.error) message = body.error
    } catch {
      // Non-JSON error body; the status text will have to do.
    }
    throw new ApiError(response.status, message)
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export const VERBS = ['read', 'propose', 'create'] as const
export type Verb = (typeof VERBS)[number]

export interface AgentToken {
  id: string
  name: string
  verbs: Verb[]
  /** `'*'` or the slugs this token may touch. */
  documents: '*' | string[]
  createdAt: number
  lastUsedAt?: number
}

export interface Settings {
  writingGuide: string
  theme: 'system' | 'light' | 'dark'
}

export const api = {
  session: () => request<{ authenticated: boolean }>('/api/session'),

  login: (password: string) =>
    request<{ authenticated: boolean }>('/api/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),

  logout: () => request<{ authenticated: boolean }>('/api/logout', { method: 'POST' }),

  documents: () => request<{ documents: DocumentMeta[] }>('/api/documents'),

  createDocument: (name: string) =>
    request<DocumentMeta>('/api/documents', { method: 'POST', body: JSON.stringify({ name }) }),

  /** A document with no name yet: its heading becomes the name. */
  createDraft: () => request<DocumentMeta>('/api/documents', { method: 'POST' }),

  document: (slug: string) =>
    request<{ slug: string; title: string; markdown: string; status: Status; moved?: boolean }>(
      `/api/documents/${slug}`,
    ),

  deleteDocument: (slug: string) =>
    request<{ slug: string; deleted: boolean }>(`/api/documents/${slug}`, { method: 'DELETE' }),

  getSettings: () => request<Settings>('/api/settings'),

  saveSettings: (settings: Settings) =>
    request<Settings>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),

  /** The file as it stands, live edits included: what a download should contain. */
  rawUrl: (slug: string) => url(`/api/documents/${slug}/raw`),

  tokens: () => request<{ tokens: AgentToken[] }>('/api/tokens'),

  /** Start a pairing: the code goes to the agent, the approval stays with the writer. */
  startPairing: (input: { name: string; verbs: Verb[]; documents: '*' | string[] }) =>
    request<{ code: string; expiresAt: number }>('/api/pair', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  pairings: () =>
    request<{ pairings: Array<{ code: string; name: string; state: string; createdAt: number }> }>(
      '/api/pair',
    ),

  approvePairing: (code: string) =>
    request<{ code: string; approved: boolean }>(`/api/pair/${code}/approve`, { method: 'POST' }),

  denyPairing: (code: string) =>
    request<{ code: string; denied: boolean }>(`/api/pair/${code}/deny`, { method: 'POST' }),

  mintToken: (input: { name: string; verbs: Verb[]; documents: '*' | string[] }) =>
    request<{ token: AgentToken; secret: string }>('/api/tokens', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  revokeToken: (id: string) =>
    request<{ id: string; revoked: boolean }>(`/api/tokens/${id}`, { method: 'DELETE' }),

  setStatus: (slug: string, status: Status) =>
    request<{ slug: string; status: Status }>(`/api/documents/${slug}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
}

export function websocketUrl(): string {
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws'
  // The path travels with the prefix so a proxy sees it; the CRDT server answers on
  // every path, so nothing else changes.
  return `${scheme}://${window.location.host}${mountPath()}`
}
