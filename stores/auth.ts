import { create } from 'zustand';

type User = { id: string } | null;
type Session = { user?: User | null } | null;

interface AuthState {
	session: Session | null;
	user: User | null;
	loading: boolean;
	setSession: (session: Session | null) => void;
	setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
	session: null,
	user: null,
	loading: true,
	setSession: (session) => set({ session, user: session?.user ?? null }),
	setLoading: (loading) => set({ loading }),
}));
