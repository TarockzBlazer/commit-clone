const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  
  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }
  
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }
  
  return response.json();
}

export const api = {
  auth: {
    register: (username: string, email: string, password: string) =>
      request<{ user: User; token: string }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username, email, password }),
      }),
    login: (username: string, password: string) =>
      request<{ user: User; token: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      }),
    me: () => request<User>('/auth/me'),
  },
  servers: {
    list: () => request<Server[]>('/servers'),
    create: (name: string) =>
      request<Server>('/servers', {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),
    get: (id: string) => request<Server>(`/servers/${id}`),
    update: (id: string, name: string) =>
      request<Server>(`/servers/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name }),
      }),
    delete: (id: string) =>
      request<void>(`/servers/${id}`, { method: 'DELETE' }),
    join: (id: string) =>
      request<void>(`/servers/${id}/join`, { method: 'POST' }),
    leave: (id: string) =>
      request<void>(`/servers/${id}/leave`, { method: 'POST' }),
  },
  channels: {
    list: (serverId: string) => request<Channel[]>(`/servers/${serverId}/channels`),
    create: (serverId: string, name: string, type: 'text' | 'voice') =>
      request<Channel>(`/servers/${serverId}/channels`, {
        method: 'POST',
        body: JSON.stringify({ name, type }),
      }),
    get: (serverId: string, id: string) =>
      request<Channel>(`/servers/${serverId}/channels/${id}`),
    update: (serverId: string, id: string, name: string) =>
      request<Channel>(`/servers/${serverId}/channels/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name }),
      }),
    delete: (serverId: string, id: string) =>
      request<void>(`/servers/${serverId}/channels/${id}`, { method: 'DELETE' }),
  },
  messages: {
    list: (channelId: string) => request<Message[]>(`/channels/${channelId}/messages`),
    create: (channelId: string, content: string) =>
      request<Message>(`/channels/${channelId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ channelId, content }),
      }),
    delete: (channelId: string, id: string) =>
      request<void>(`/channels/${channelId}/messages/${id}`, { method: 'DELETE' }),
  },
};

export interface User {
  id: string;
  username: string;
  email: string;
  createdAt: string;
}

export interface Server {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  members: ServerMember[];
  owner: { id: string; username: string };
  channels: Channel[];
}

export interface ServerMember {
  id: string;
  userId: string;
  serverId: string;
  role: string;
  joinedAt: string;
  user?: { id: string; username: string };
}

export interface Channel {
  id: string;
  name: string;
  type: 'text' | 'voice';
  serverId: string;
  createdAt: string;
  updatedAt: string;
  server?: Server;
}

export interface Message {
  id: string;
  content: string;
  userId: string;
  channelId: string;
  createdAt: string;
  updatedAt: string;
  user: { id: string; username: string };
}