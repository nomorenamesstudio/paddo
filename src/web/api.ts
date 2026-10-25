export interface DocumentMeta {
  slug: string
  title: string
  words: number
  updatedAt: number
  bytes: number
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
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

  document: (slug: string) => request<{ slug: string; title: string; markdown: string }>(`/api/documents/${slug}`),
}

export function websocketUrl(): string {
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${scheme}://${window.location.host}`
}
