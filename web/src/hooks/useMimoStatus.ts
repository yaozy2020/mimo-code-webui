import { useEffect, useState } from "react"
import { AuthRequiredError, fetchLocalStatus, fetchStatus } from "@/api/client"
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
          const mimo = data.mimo as { healthy?: boolean; url?: string; version?: string; managed?: boolean; workspaceRoot?: string; path?: { directory?: string; worktree?: string } } | undefined
          if (mimo) {
            dispatch({
              type: "SET_STATUS",
              status: {
                mimoHealthy: !!mimo.healthy,
                mimoUrl: mimo.url ?? "http://127.0.0.1:4096",
                mimoVersion: mimo.version,
                mimoManaged: !!mimo.managed,
                workspaceRoot: mimo.workspaceRoot,
                directory: mimo.path?.directory,
                worktree: mimo.path?.worktree,
              },
            })
          }
          dispatch({ type: "SET_AUTH_REQUIRED", required: authRequired })
          if (authRequired) {
            try {
              await fetchLocalStatus()
            } catch (error) {
              if (error instanceof AuthRequiredError) dispatch({ type: "SET_AUTH_DIALOG_OPEN", open: true })
            }
          }
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
