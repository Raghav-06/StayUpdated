import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, setUnauthorizedHandler, tokenStore } from './api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(() => Boolean(tokenStore.get()))
  // null until the backend says whether Google sign-in is configured.
  const [googleEnabled, setGoogleEnabled] = useState(null)

  const signOut = useCallback(() => {
    tokenStore.clear()
    setUser(null)
  }, [])

  // Called with the { token, user } the backend returns on a successful sign-in.
  const signIn = useCallback(({ token, user }) => {
    tokenStore.set(token)
    setUser(user)
  }, [])

  // Used by the Google callback, which only receives a token.
  const signInWithToken = useCallback(async (token) => {
    tokenStore.set(token)
    const { user } = await api('/auth/me')
    setUser(user)
  }, [])

  useEffect(() => {
    api('/auth/config', { auth: false })
      .then((config) => setGoogleEnabled(config.google === true))
      .catch(() => setGoogleEnabled(null))
  }, [])

  useEffect(() => {
    setUnauthorizedHandler(signOut)
    if (!tokenStore.get()) return
    api('/auth/me')
      .then(({ user }) => setUser(user))
      .catch(() => signOut())
      .finally(() => setLoading(false))
  }, [signOut])

  const value = useMemo(
    () => ({ user, loading, googleEnabled, signIn, signInWithToken, signOut }),
    [user, loading, googleEnabled, signIn, signInWithToken, signOut],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
