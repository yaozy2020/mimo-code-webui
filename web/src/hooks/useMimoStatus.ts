import { useEffect, useState } from "react"
import { fetchStatus } from "@/api/client"
import { useAppDispatch } from "@/stores/appStore"

export function useMimoStatus(pollInterval = 5000) {
  const dispatch = useAppDispatch()
  const [status, setStatus] = useState<{
    loading: boolean
    error: Error | null
    data: Record<string, unknown> | null
  }>({ loading: true, error: null, data: null })

  useEffect(() => {
    let cancelled = false

    const check = async () => {
      try {
        const data = await fetchStatus()
        if (!cancelled) {
          setStatus({ loading: false, error: null, data })
          const authRequired = !!data.authRequired
          dispatch({ type: "SET_AUTH_REQUIRED", required: authRequired })
          if (!authRequired && localStorage.getItem("mimo-webui-auth-token")) {
            dispatch({ type: "UPDATE_SETTINGS", settings: { authToken: "" } })
          }
        }
      } catch (error) {
        if (!cancelled) setStatus({ loading: false, error: error as Error, data: null })
      }
    }

    check()
    const interval = setInterval(check, pollInterval)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [dispatch, pollInterval])

  return status
}
