import { createContext, useContext } from 'react'

// Filled by AuthProvider (auth.jsx).
export const AuthContext = createContext(null)

export function useAuth() {
  return useContext(AuthContext)
}
