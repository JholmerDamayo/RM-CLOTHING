const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const SUPABASE_REST_URL = (import.meta.env.VITE_SUPABASE_REST_URL || `${SUPABASE_URL}/rest/v1`).replace(/\/$/, '');
const SUPABASE_AUTH_URL = `${SUPABASE_URL}/auth/v1`;
const SESSION_STORAGE_KEY = 'rm-clothing-supabase-session';
const STORAGE_MODE_KEY = 'rm-clothing-supabase-storage-mode';

function getSessionStorage(mode = 'local') {
    return mode === 'session' ? window.sessionStorage : window.localStorage;
}

function buildHeaders(accessToken, extraHeaders = {}) {
    return {
        apikey: SUPABASE_ANON_KEY,
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...extraHeaders
    };
}

async function parseResponse(response) {
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;

    if (!response.ok) {
        throw new Error(
            data?.msg ||
            data?.message ||
            data?.error_description ||
            data?.error ||
            'Unable to complete the Supabase request.'
        );
    }

    return data;
}

async function fetchAuthUser(accessToken) {
    const response = await fetch(`${SUPABASE_AUTH_URL}/user`, {
        method: 'GET',
        headers: buildHeaders(accessToken)
    });

    return parseResponse(response);
}

async function fetchCustomerProfile(accessToken, userId) {
    const query = new URLSearchParams({
        id: `eq.${userId}`,
        select: 'id,full_name,email,created_at,updated_at'
    });

    const response = await fetch(`${SUPABASE_REST_URL}/customer_profiles?${query.toString()}`, {
        method: 'GET',
        headers: buildHeaders(accessToken)
    });

    const rows = await parseResponse(response);
    return rows?.[0] || null;
}

async function fetchAdminProfile(accessToken, userId) {
    const query = new URLSearchParams({
        user_id: `eq.${userId}`,
        select: 'user_id'
    });

    const response = await fetch(`${SUPABASE_REST_URL}/admin_profiles?${query.toString()}`, {
        method: 'GET',
        headers: buildHeaders(accessToken)
    });

    const rows = await parseResponse(response);
    return rows?.[0] || null;
}

async function upsertCustomerProfile(accessToken, user) {
    const payload = {
        id: user.id,
        email: user.email,
        full_name: user.user_metadata?.name || user.user_metadata?.full_name || user.email
    };

    const response = await fetch(`${SUPABASE_REST_URL}/customer_profiles`, {
        method: 'POST',
        headers: buildHeaders(accessToken, {
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates,return=representation'
        }),
        body: JSON.stringify(payload)
    });

    const rows = await parseResponse(response);
    return rows?.[0] || payload;
}

function saveSession(session, rememberMe = true) {
    const mode = rememberMe ? 'local' : 'session';

    try {
        window.localStorage.removeItem(SESSION_STORAGE_KEY);
        window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
        getSessionStorage(mode).setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
        window.localStorage.setItem(STORAGE_MODE_KEY, mode);
    } catch (error) {
        console.warn('Unable to save Supabase session.', error);
    }
}

export function getStoredSession() {
    try {
        const mode = window.localStorage.getItem(STORAGE_MODE_KEY) || 'local';
        const localSession = window.localStorage.getItem(SESSION_STORAGE_KEY);
        const sessionSession = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
        const rawSession = mode === 'session'
            ? (sessionSession || localSession)
            : (localSession || sessionSession);

        return JSON.parse(rawSession || 'null');
    } catch (error) {
        console.warn('Unable to read Supabase session.', error);
        return null;
    }
}

export function clearStoredSession() {
    try {
        window.localStorage.removeItem(SESSION_STORAGE_KEY);
        window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
        window.localStorage.removeItem(STORAGE_MODE_KEY);
    } catch (error) {
        console.warn('Unable to clear Supabase session.', error);
    }
}

export function hasSupabaseConfig() {
    return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

export async function signUpWithSupabase({ email, password, name }) {
    const response = await fetch(`${SUPABASE_AUTH_URL}/signup`, {
        method: 'POST',
        headers: buildHeaders(null, {
            'Content-Type': 'application/json'
        }),
        body: JSON.stringify({
            email,
            password,
            data: {
                name
            }
        })
    });

    const data = await parseResponse(response);

    if (!data?.session || !data?.user) {
        return {
            session: null,
            user: data?.user || null,
            currentUser: null,
            needsEmailConfirmation: true,
            verificationEmail: email
        };
    }

    saveSession(data.session, true);
    const profile = await upsertCustomerProfile(data.session.access_token, data.user);
    const adminProfile = await fetchAdminProfile(data.session.access_token, data.user.id);

    return {
        session: data.session,
        user: data.user,
        currentUser: {
            id: data.user.id,
            email: data.user.email,
            name: profile?.full_name || data.user.user_metadata?.name || data.user.email,
            role: adminProfile ? 'admin' : 'customer'
        },
        needsEmailConfirmation: false,
        verificationEmail: null
    };
}

export async function verifySignupCodeWithSupabase({ email, token, rememberMe = true }) {
    const response = await fetch(`${SUPABASE_AUTH_URL}/verify`, {
        method: 'POST',
        headers: buildHeaders(null, {
            'Content-Type': 'application/json'
        }),
        body: JSON.stringify({
            email,
            token,
            type: 'signup'
        })
    });

    const session = await parseResponse(response);
    saveSession(session, rememberMe);
    const currentUser = await buildCurrentUser(session);

    return {
        session,
        currentUser
    };
}

export async function signInWithSupabase({ email, password, rememberMe = true }) {
    const response = await fetch(`${SUPABASE_AUTH_URL}/token?grant_type=password`, {
        method: 'POST',
        headers: buildHeaders(null, {
            'Content-Type': 'application/json'
        }),
        body: JSON.stringify({
            email,
            password
        })
    });

    const session = await parseResponse(response);
    saveSession(session, rememberMe);
    const currentUser = await buildCurrentUser(session);

    return {
        session,
        currentUser
    };
}

export async function refreshSupabaseSession(refreshToken) {
    const response = await fetch(`${SUPABASE_AUTH_URL}/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: buildHeaders(null, {
            'Content-Type': 'application/json'
        }),
        body: JSON.stringify({
            refresh_token: refreshToken
        })
    });

    const session = await parseResponse(response);
    saveSession(session, true);
    return session;
}

export async function buildCurrentUser(session) {
    const authUser = await fetchAuthUser(session.access_token);
    const profile = await upsertCustomerProfile(session.access_token, authUser);
    const adminProfile = await fetchAdminProfile(session.access_token, authUser.id);

    return {
        id: authUser.id,
        email: authUser.email,
        name: profile?.full_name || authUser.user_metadata?.name || authUser.email,
        role: adminProfile ? 'admin' : 'customer'
    };
}

export async function restoreSupabaseUser() {
    const storedSession = getStoredSession();
    if (!storedSession?.access_token) return null;

    try {
        const currentUser = await buildCurrentUser(storedSession);
        return {
            session: storedSession,
            currentUser
        };
    } catch (error) {
        if (storedSession.refresh_token) {
            try {
                const refreshedSession = await refreshSupabaseSession(storedSession.refresh_token);
                const currentUser = await buildCurrentUser(refreshedSession);

                return {
                    session: refreshedSession,
                    currentUser
                };
            } catch (refreshError) {
                clearStoredSession();
                throw refreshError;
            }
        }

        clearStoredSession();
        throw error;
    }
}

export async function signOutFromSupabase(accessToken) {
    if (!accessToken) {
        clearStoredSession();
        return;
    }

    try {
        await fetch(`${SUPABASE_AUTH_URL}/logout`, {
            method: 'POST',
            headers: buildHeaders(accessToken)
        });
    } finally {
        clearStoredSession();
    }
}
