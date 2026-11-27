export interface User {
  id: string;
  email: string;
  display_name?: string | null;
  avatar_url?: string | null;
  status_message?: string | null;
  theme?: string | null;
  hidden_sidebar_items?: string[] | null;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface Playlist {
  id: string;
  userId: string;
  name: string;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PlaylistItem {
  id: string;
  playlistId: string;
  position: number;
  videoId: string;
  title: string;
  thumbnail: string;
  channelName: string;
  durationSeconds: number;
  addedAt: string;
}

export interface GutenbergBook {
  id: number;
  title: string;
  authors: string[];
  cover: string | null;
  subjects: string[];
  downloads: number;
  summary: string | null;
  has_text: boolean;
}

export interface BookSearchResponse {
  books: GutenbergBook[];
  count: number;
  next_page: number | null;
}

export interface AdminDayCount {
  date: string;
  count: number;
}

export interface AdminUserRow {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  sign_in_method: string;
  joined_at: string;
  last_active_at: string | null;
  items: number;
  expenses: number;
}

export interface AdminStats {
  total_users: number;
  new_users7d: number;
  new_users30d: number;
  active_users7d: number;
  active_users30d: number;
  google_users: number;
  email_users: number;
  notes: number;
  notebook_pages: number;
  tasks: number;
  events: number;
  expenses: number;
  chat_conversations: number;
  signups_by_day: AdminDayCount[];
  active_by_day: AdminDayCount[];
  users: AdminUserRow[];
}

export interface ChatConversation {
  id: string;
  title: string;
  message_count: number;
  created_at: string;
  updated_at: string;
}

export interface StoredChatMessage {
  id: string;
  conversation_id: string;
  role: "user" | "model";
  text: string;
  created_at: string;
}

export interface AppNotification {
  id: string;
  userId: string;
  category: string;
  title: string;
  body: string;
  icon?: string;
  link?: string;
  isRead: boolean;
  createdAt: string;
}

function normalizeNotification(n: any): AppNotification {
  return {
    id: n.id,
    userId: n.userId ?? n.user_id ?? "",
    category: n.category ?? "general",
    title: n.title ?? "",
    body: n.body ?? "",
    icon: n.icon ?? undefined,
    link: n.link ?? undefined,
    isRead: n.isRead ?? n.is_read ?? false,
    createdAt: n.createdAt ?? n.created_at ?? new Date().toISOString(),
  };
}

class ApiClient {
  private get baseUrl() {
    return import.meta.env.VITE_API_URL || "http://localhost:5000";
  }

  private get token() {
    if (typeof window !== "undefined") {
      return localStorage.getItem("lifepulse_jwt") || sessionStorage.getItem("lifepulse_jwt");
    }
    return null;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    };

    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      if (typeof window !== "undefined") {
        localStorage.removeItem("lifepulse_jwt");
        sessionStorage.removeItem("lifepulse_jwt");
      }
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
    }

    if (response.status === 204) {
      return {} as T;
    }

    return response.json();
  }

  get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: "GET" });
  }

  post<T>(endpoint: string, data?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  put<T>(endpoint: string, data?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  patch<T>(endpoint: string, data?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: "DELETE" });
  }

  // Auth Operations
  auth = {
    login: async (emailOrData: string | { email: string; password: string }, password?: string): Promise<AuthResponse> => {
      const payload = typeof emailOrData === "string" ? { email: emailOrData, password } : emailOrData;
      const res = await this.post<AuthResponse>("/api/auth/login", payload);
      if (typeof window !== "undefined") {
        localStorage.setItem("lifepulse_jwt", res.token);
        sessionStorage.removeItem("lifepulse_jwt");
      }
      return res;
    },

    register: async (emailOrData: string | { email: string; password: string }, password?: string): Promise<AuthResponse> => {
      const payload = typeof emailOrData === "string" ? { email: emailOrData, password } : emailOrData;
      const res = await this.post<AuthResponse>("/api/auth/register", payload);
      if (typeof window !== "undefined") {
        localStorage.setItem("lifepulse_jwt", res.token);
        sessionStorage.removeItem("lifepulse_jwt");
      }
      return res;
    },

    signUp: async (emailOrData: string | { email: string; password: string }, password?: string): Promise<AuthResponse> => {
      return this.auth.register(emailOrData, password);
    },

    signInWithPassword: async (emailOrData: string | { email: string; password: string }, password?: string): Promise<AuthResponse> => {
      return this.auth.login(emailOrData, password);
    },

    signInWithGoogleCredential: async (credential: string): Promise<AuthResponse> => {
      const res = await this.post<AuthResponse>("/api/auth/google", { credential });
      if (typeof window !== "undefined") {
        localStorage.setItem("lifepulse_jwt", res.token);
        sessionStorage.removeItem("lifepulse_jwt");
      }
      return res;
    },

    signOut: async (): Promise<void> => {
      if (typeof window !== "undefined") {
        localStorage.removeItem("lifepulse_jwt");
        sessionStorage.removeItem("lifepulse_jwt");
      }
    },

    getUser: async (): Promise<User | null> => {
      if (!this.token) return null;
      try {
        return await this.get<User>("/api/auth/me");
      } catch {
        return null;
      }
    },

    setSessionToken: (token: string): void => {
      if (typeof window !== "undefined") {
        localStorage.setItem("lifepulse_jwt", token);
        sessionStorage.removeItem("lifepulse_jwt");
        window.dispatchEvent(new CustomEvent("lifepulse-auth-change", { detail: { token } }));
      }
    },

    onAuthStateChange: (callback: (event: string) => void) => {
      const handleCustom = (e: Event) => {
        const detail = (e as CustomEvent).detail;
        callback(detail?.token ? "SIGNED_IN" : "SIGNED_OUT");
      };
      window.addEventListener("lifepulse-auth-change", handleCustom);
      return {
        subscription: {
          unsubscribe: () => window.removeEventListener("lifepulse-auth-change", handleCustom),
        },
      };
    },
  };

  // Profile Operations
  profile = {
    get: (): Promise<User> => {
      return this.get<User>("/api/auth/me");
    },
    update: (data: {
      display_name?: string | null;
      avatar_url?: string | null;
      status_message?: string | null;
      theme?: string | null;
      hidden_sidebar_items?: string[] | null;
    }): Promise<User> => {
      return this.patch<User>("/api/auth/profile", data);
    },
  };

  // Per-user settings (server-side key/value preferences)
  settings = {
    get: async <T,>(key: string): Promise<T | null> => {
      const res = await this.get<{ key: string; value?: T | null }>(`/api/settings/${encodeURIComponent(key)}`);
      return res?.value ?? null;
    },
    put: async <T,>(key: string, value: T): Promise<T> => {
      const res = await this.put<{ key: string; value: T }>(`/api/settings/${encodeURIComponent(key)}`, { value });
      return res.value;
    },
  };

  // AI assistant chat history
  chats = {
    list: (): Promise<ChatConversation[]> => this.get<ChatConversation[]>("/api/chats"),
    create: (title?: string): Promise<ChatConversation> => this.post<ChatConversation>("/api/chats", { title }),
    rename: (id: string, title: string): Promise<ChatConversation> => this.patch<ChatConversation>(`/api/chats/${id}`, { title }),
    delete: (id: string): Promise<void> => this.delete<void>(`/api/chats/${id}`),
    messages: (id: string): Promise<StoredChatMessage[]> => this.get<StoredChatMessage[]>(`/api/chats/${id}/messages`),
    addMessage: (id: string, role: "user" | "model", text: string): Promise<StoredChatMessage> =>
      this.post<StoredChatMessage>(`/api/chats/${id}/messages`, { role, text }),
    recentMessages: (limit = 30): Promise<StoredChatMessage[]> =>
      this.get<StoredChatMessage[]>(`/api/chats/recent-messages?limit=${limit}`),
  };

  // Playlists Operations
  playlists = {
    getAll: async (): Promise<Playlist[]> => {
      const data = await this.get<any[]>("/api/playlists");
      return data.map((p) => ({
        id: p.id,
        userId: p.userId ?? p.user_id,
        name: p.name,
        itemCount: p.itemCount ?? p.item_count ?? 0,
        createdAt: p.createdAt ?? p.created_at,
        updatedAt: p.updatedAt ?? p.updated_at,
      }));
    },
    create: async (name: string): Promise<Playlist> => {
      const p = await this.post<any>("/api/playlists", { name });
      return {
        id: p.id,
        userId: p.userId ?? p.user_id,
        name: p.name,
        itemCount: p.itemCount ?? p.item_count ?? 0,
        createdAt: p.createdAt ?? p.created_at,
        updatedAt: p.updatedAt ?? p.updated_at,
      };
    },
    rename: async (id: string, name: string): Promise<Playlist> => {
      const p = await this.patch<any>(`/api/playlists/${id}`, { name });
      return {
        id: p.id,
        userId: p.userId ?? p.user_id,
        name: p.name,
        itemCount: p.itemCount ?? p.item_count ?? 0,
        createdAt: p.createdAt ?? p.created_at,
        updatedAt: p.updatedAt ?? p.updated_at,
      };
    },
    delete: (id: string): Promise<void> => {
      return this.delete<void>(`/api/playlists/${id}`);
    },
    getItems: async (id: string): Promise<PlaylistItem[]> => {
      const data = await this.get<any[]>(`/api/playlists/${id}/items`);
      return data.map((item) => ({
        id: item.id,
        playlistId: item.playlistId ?? item.playlist_id,
        position: item.position,
        videoId: item.videoId ?? item.video_id,
        title: item.title,
        thumbnail: item.thumbnail,
        channelName: item.channelName ?? item.channel_name,
        durationSeconds: item.durationSeconds ?? item.duration_seconds ?? 0,
        addedAt: item.addedAt ?? item.added_at,
      }));
    },
    addItem: async (
      id: string,
      item: {
        videoId: string;
        title: string;
        thumbnail: string;
        channelName: string;
        durationSeconds: number;
      }
    ): Promise<PlaylistItem> => {
      // Backend uses SnakeCaseLower JSON — send snake_case keys & normalize response
      const itemData = await this.post<any>(`/api/playlists/${id}/items`, {
        video_id: item.videoId,
        title: item.title,
        thumbnail: item.thumbnail,
        channel_name: item.channelName,
        duration_seconds: item.durationSeconds,
      });
      return {
        id: itemData.id,
        playlistId: itemData.playlistId ?? itemData.playlist_id,
        position: itemData.position,
        videoId: itemData.videoId ?? itemData.video_id,
        title: itemData.title,
        thumbnail: itemData.thumbnail,
        channelName: itemData.channelName ?? itemData.channel_name,
        durationSeconds: itemData.durationSeconds ?? itemData.duration_seconds ?? 0,
        addedAt: itemData.addedAt ?? itemData.added_at,
      };
    },
    removeItem: (id: string, itemId: string): Promise<void> => {
      return this.delete<void>(`/api/playlists/${id}/items/${itemId}`);
    },
    reorderItems: (id: string, items: { id: string; position: number }[]): Promise<void> => {
      return this.patch<void>(`/api/playlists/${id}/items/reorder`, { items });
    },
  };

  // Notifications Operations
  notifications = {
    getAll: async (): Promise<AppNotification[]> => {
      const data = await this.get<any[]>("/api/notifications");
      return data.map(normalizeNotification);
    },

    create: async (n: {
      category: string;
      title: string;
      body: string;
      icon?: string;
      link?: string;
    }): Promise<AppNotification> => {
      const data = await this.post<any>("/api/notifications", n);
      return normalizeNotification(data);
    },

    markRead: async (id: string, isRead = true): Promise<AppNotification> => {
      const data = await this.patch<any>(`/api/notifications/${id}/read`, { is_read: isRead });
      return normalizeNotification(data);
    },

    markAllRead: (): Promise<void> =>
      this.patch<void>("/api/notifications/read-all", {}),

    delete: (id: string): Promise<void> =>
      this.delete<void>(`/api/notifications/${id}`),

    deleteAll: (): Promise<void> =>
      this.delete<void>("/api/notifications"),
  };

  // ── Books ───────────────────────────────────────────────────────────────────
  books = {
    search: (params: { q?: string; topic?: string; page?: number }): Promise<BookSearchResponse> => {
      const qs = new URLSearchParams();
      if (params.q) qs.set("q", params.q);
      if (params.topic) qs.set("topic", params.topic);
      qs.set("page", String(params.page ?? 1));
      return this.get<BookSearchResponse>(`/api/books/search?${qs}`);
    },
    text: (id: number): Promise<{ id: number; text: string }> => this.get<{ id: number; text: string }>(`/api/books/${id}/text`),
  };

  admin = {
    me: (): Promise<{ is_admin: boolean }> => this.get<{ is_admin: boolean }>("/api/admin/me"),
    stats: (): Promise<AdminStats> => this.get<AdminStats>("/api/admin/stats"),
  };

}

export const apiClient = new ApiClient();
