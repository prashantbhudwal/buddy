import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

export type RightSidebarTab = "curriculum" | "settings"
export const UI_PREFERENCES_STORAGE_KEY = "buddy.ui.v1"

type UiPreferencesStore = {
  pinnedByDirectory: Record<string, string[]>
  unreadByDirectory: Record<string, Record<string, true>>
  leftSidebarOpen: boolean
  leftSidebarWidth: number
  rightSidebarOpen: boolean
  rightSidebarWidth: number
  rightSidebarTab: RightSidebarTab
  isPinned: (directory: string, sessionID: string) => boolean
  togglePinned: (directory: string, sessionID: string) => void
  markUnread: (directory: string, sessionID: string) => void
  clearUnread: (directory: string, sessionID: string) => void
  isUnread: (directory: string, sessionID: string) => boolean
  clearDirectorySessionState: (directory: string, sessionID: string) => void
  setLeftSidebarOpen: (open: boolean) => void
  setLeftSidebarWidth: (width: number) => void
  setRightSidebarOpen: (open: boolean) => void
  setRightSidebarWidth: (width: number) => void
  setRightSidebarTab: (tab: RightSidebarTab) => void
}

export const useUiPreferences = create<UiPreferencesStore>()(
  persist(
    (set, get) => ({
      pinnedByDirectory: {},
      unreadByDirectory: {},
      leftSidebarOpen: true,
      leftSidebarWidth: 344,
      rightSidebarOpen: false,
      rightSidebarWidth: 344,
      rightSidebarTab: "curriculum",
      isPinned(directory, sessionID) {
        return (get().pinnedByDirectory[directory] ?? []).includes(sessionID)
      },
      togglePinned(directory, sessionID) {
        set((state) => {
          const current = state.pinnedByDirectory[directory] ?? []
          const exists = current.includes(sessionID)
          const next = exists ? current.filter((id) => id !== sessionID) : [sessionID, ...current]
          return {
            pinnedByDirectory: {
              ...state.pinnedByDirectory,
              [directory]: next,
            },
          }
        })
      },
      markUnread(directory, sessionID) {
        set((state) => ({
          unreadByDirectory: {
            ...state.unreadByDirectory,
            [directory]: {
              ...(state.unreadByDirectory[directory] ?? {}),
              [sessionID]: true,
            },
          },
        }))
      },
      clearUnread(directory, sessionID) {
        set((state) => {
          const current = { ...(state.unreadByDirectory[directory] ?? {}) }
          delete current[sessionID]
          return {
            unreadByDirectory: {
              ...state.unreadByDirectory,
              [directory]: current,
            },
          }
        })
      },
      isUnread(directory, sessionID) {
        return !!get().unreadByDirectory[directory]?.[sessionID]
      },
      clearDirectorySessionState(directory, sessionID) {
        set((state) => {
          const pinned = (state.pinnedByDirectory[directory] ?? []).filter((id) => id !== sessionID)
          const unread = { ...(state.unreadByDirectory[directory] ?? {}) }
          delete unread[sessionID]
          return {
            pinnedByDirectory: {
              ...state.pinnedByDirectory,
              [directory]: pinned,
            },
            unreadByDirectory: {
              ...state.unreadByDirectory,
              [directory]: unread,
            },
          }
        })
      },
      setLeftSidebarOpen(open) {
        set({ leftSidebarOpen: open })
      },
      setLeftSidebarWidth(width) {
        set({ leftSidebarWidth: width })
      },
      setRightSidebarOpen(open) {
        set({ rightSidebarOpen: open })
      },
      setRightSidebarWidth(width) {
        set({ rightSidebarWidth: width })
      },
      setRightSidebarTab(tab) {
        set({ rightSidebarTab: tab })
      },
    }),
    {
      name: UI_PREFERENCES_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize(state) {
        return {
          pinnedByDirectory: state.pinnedByDirectory,
          unreadByDirectory: state.unreadByDirectory,
          leftSidebarOpen: state.leftSidebarOpen,
          leftSidebarWidth: state.leftSidebarWidth,
          rightSidebarOpen: state.rightSidebarOpen,
          rightSidebarWidth: state.rightSidebarWidth,
          rightSidebarTab: state.rightSidebarTab,
        }
      },
    },
  ),
)
