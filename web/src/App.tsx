import { useEffect, useState } from "react"
import { AuthDialog } from "@/components/auth/AuthDialog"
import { listPermissions, listQuestions } from "@/api/message"
import { ChatArea } from "@/components/chat/ChatArea"
import { DiagnosticsPanel } from "@/components/diagnostics/DiagnosticsPanel"
import { Header } from "@/components/layout/Header"
import { Sidebar } from "@/components/layout/Sidebar"
import { SettingsPanel } from "@/components/settings/SettingsPanel"
import { useMimoStatus } from "@/hooks/useMimoStatus"
import { useStreamingMessage } from "@/hooks/useStreamingMessage"
import { AppProvider, useAppDispatch, useAppState } from "@/stores/appStore"
import { cn } from "@/lib/utils"
import type { SlashAction } from "@/components/chat/slashCommands"

function AppContent() {
  const [showSettings, setShowSettings] = useState(false)
  const [showDiagnostics, setShowDiagnostics] = useState(false)
  const [showSidebar, setShowSidebar] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const dispatch = useAppDispatch()
  const { settings } = useAppState()

  useStreamingMessage()
  useMimoStatus()

  useEffect(() => {
    let cancelled = false

    const loadPendingPermissions = async () => {
      try {
        const permissions = await listPermissions()
        if (cancelled) return
        dispatch({ type: "SET_PENDING_PERMISSIONS", permissions })
      } catch (error) {
        console.error("[App] failed to load pending permissions:", error)
      }
    }

    void loadPendingPermissions()
    return () => {
      cancelled = true
    }
  }, [dispatch])

  const handleSlashAction = (action: SlashAction) => {
    if (action === "models") {
      setShowSettings(true)
      return
    }
    if (action === "sessions") {
      setShowSidebar(true)
      setSidebarOpen(true)
    }
  }

  useEffect(() => {
    let cancelled = false

    const loadPendingQuestions = async () => {
      try {
        const questions = await listQuestions()
        if (cancelled) return
        dispatch({ type: "SET_PENDING_QUESTIONS", questions })
      } catch (error) {
        console.error("[App] failed to load pending questions:", error)
      }
    }

    void loadPendingQuestions()
    return () => {
      cancelled = true
    }
  }, [dispatch])

  return (
    <div className={cn("flex h-dvh min-h-0 flex-col bg-background", settings.theme)}>
      <Header
        onOpenSidebar={() => setShowSidebar(true)}
        onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
        sidebarOpen={sidebarOpen}
        onOpenSettings={() => setShowSettings(true)}
        onOpenDiagnostics={() => setShowDiagnostics(true)}
      />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar open={showSidebar} onClose={() => setShowSidebar(false)} desktopOpen={sidebarOpen} />
        <ChatArea onSlashAction={handleSlashAction} />
      </div>
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
      {showDiagnostics && <DiagnosticsPanel onClose={() => setShowDiagnostics(false)} />}
      <AuthDialog />
    </div>
  )
}

function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  )
}

export default App
