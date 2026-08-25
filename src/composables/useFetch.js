import { useAuth } from './useAuth.js'

/**
 * fetch wrapper that automatically attaches the auth token.
 * On a 401 response it clears the token and redirects to /login.
 *
 * @claude
 * @chatgpt Retries once after a successful refresh-token exchange so an expired
 * @chatgpt access token does not immediately interrupt the user's session.
 */
export function authFetch(url, options = {}) {
  const { getToken, logout, refreshAccessToken, isPersistentSession } = useAuth()
  const token = getToken()

  const headers = { ...options.headers }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  return fetch(url, { ...options, headers }).then(async (res) => {
    if (res.status === 401) {
      let detail = ''
      try {
        detail = (await res.clone().json())?.detail || ''
      } catch {
        // @claude Non-JSON 401 body — treated as an ordinary expiry.
      }
      if (detail === 'token revoked') {
        // @claude Epoch mismatch: a newer login replaced this session (FR-047).
        // @claude No refresh attempt — the refresh token is revoked with it.
        // @claude revoke:false — this session's credentials are already dead,
        // @claude and a logout call with them must not touch the new session.
        logout({ redirect: true, revoke: false, reason: 'sessionReplaced' })
        return res
      }
      const refreshed = isPersistentSession.value ? await refreshAccessToken() : false
      if (refreshed) {
        const retryHeaders = { ...options.headers, Authorization: `Bearer ${getToken()}` }
        return fetch(url, { ...options, headers: retryHeaders })
      }
      logout({ redirect: true })
    }
    return res
  })
}

// @claude 실패 응답의 사유 추출. 백엔드가 오류 본문을 detail로 통일했으므로
// @claude(회신서 §12.1) detail을 우선하고, 구 버전의 error·reason도 받아 둔다.
export async function failureDetail(res, fallback) {
  try {
    const body = await res.clone().json()
    return body?.detail || body?.error || body?.reason || fallback
  } catch {
    return fallback
  }
}
