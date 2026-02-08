import { create } from "zustand"

import type { Session, User } from "@supabase/supabase-js"

interface AuthState {
	session: Session | null
	user: User | null
	loading: boolean
	setSession: (session: Session | null) => void
	setLoading: (loading: boolean) => void
}

export const useAuthStore = create<AuthState>((set) => ({
	session: null,
	user: null,
	loading: true,
	setSession: (session) => set({ session, user: session?.user ?? null }),
	setLoading: (loading) => set({ loading }),
}))
