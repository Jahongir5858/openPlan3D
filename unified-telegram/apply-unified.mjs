import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(process.argv[2] || process.cwd())

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n')
}
function write(rel, value) {
  fs.writeFileSync(path.join(root, rel), value, 'utf8')
}
function mustReplace(source, from, to, label) {
  if (!source.includes(from)) throw new Error(`Patch failed: ${label}`)
  return source.replace(from, to)
}
function mustReplaceAll(source, from, to, label, min = 1) {
  const count = source.split(from).length - 1
  if (count < min) throw new Error(`Patch failed: ${label}; found ${count}, expected >= ${min}`)
  return source.split(from).join(to)
}

let app = read('src/App.tsx')

app = mustReplace(
  app,
  "const [messagesByChat, setMessagesByChat] = useState<Record<string, MessageItem[]>>({})",
  `const [messagesByChat, setMessagesByChat] = useState<Record<string, MessageItem[]>>({})

  const chatStoreKey = (accountId?: string | null, chatId?: string | null) =>
    accountId && chatId ? \`\${accountId}:\${chatId}\` : ''`,
  'insert composite message key'
)

app = mustReplace(
  app,
  "const [isUnifiedInboxOpen, setIsUnifiedInboxOpen] = useState(false)",
  "const [isUnifiedInboxOpen, setIsUnifiedInboxOpen] = useState(true)",
  'make unified workspace default'
)

app = mustReplace(
  app,
  `if (accs && accs.length > 0) {
            const firstConnected = (accs as AccountInfo[]).find((a: AccountInfo) => a.status === 'connected') || accs[0]
            setActiveAccountId(firstConnected.id)
            if (firstConnected.status === 'connected') {
              loadDialogsForAccount(firstConnected.id)
            }
          }`,
  `if (accs && accs.length > 0) {
            const typedAccounts = accs as AccountInfo[]
            const connectedAccounts = typedAccounts.filter((a) => a.status === 'connected')
            const firstConnected = connectedAccounts[0] || typedAccounts[0]
            setActiveAccountId(firstConnected.id)
            void Promise.all(connectedAccounts.map((a) => loadDialogsForAccount(a.id)))
          }`,
  'load all accounts initially'
)

app = mustReplace(
  app,
  `setMessagesByChat((prev) => ({
          ...prev,
          [chatId]: [...(prev[chatId] || []), message],
        }))`,
  `setMessagesByChat((prev) => {
          const key = chatStoreKey(accountId, chatId)
          return {
            ...prev,
            [key]: [...(prev[key] || []), message],
          }
        })`,
  'route realtime messages by account'
)

app = mustReplace(
  app,
  `setActiveAccountId((currentActive) => {
          if (!currentActive || currentActive === updated.id) {
            if (updated.status === 'connected') {
              loadDialogsForAccount(updated.id)
            }
            return updated.id
          }
          return currentActive
        })`,
  `if (updated.status === 'connected') loadDialogsForAccount(updated.id)
        setActiveAccountId((currentActive) => currentActive || updated.id)`,
  'hydrate connected account updates'
)

app = mustReplace(
  app,
  `if (payload?.accounts && payload.accounts.length > 0) {
          setAccounts(payload.accounts)
          const firstConnected = payload.accounts.find((a) => a.status === 'connected')
          if (firstConnected) {
            setActiveAccountId((currentActive) => {
              if (!currentActive) {
                loadDialogsForAccount(firstConnected.id)
                return firstConnected.id
              }
              return currentActive
            })
          }
        }`,
  `if (payload?.accounts && payload.accounts.length > 0) {
          setAccounts(payload.accounts)
          const connectedAccounts = payload.accounts.filter((a) => a.status === 'connected')
          const firstConnected = connectedAccounts[0]
          if (firstConnected) {
            setActiveAccountId((currentActive) => currentActive || firstConnected.id)
          }
          void Promise.all(connectedAccounts.map((a) => loadDialogsForAccount(a.id)))
        }`,
  'load all accounts on hydration event'
)

app = mustReplace(
  app,
  `setMessagesByChat((prev) => ({ ...prev, [chatId]: msgs }))`,
  `setMessagesByChat((prev) => ({ ...prev, [chatStoreKey(accountId, chatId)]: msgs }))`,
  'cache loaded messages by account'
)

app = mustReplace(
  app,
  `const handleMergeHistoricalMessages = (newMsgs: MessageItem[]) => {
    if (!activeChatId || !newMsgs || newMsgs.length === 0) return
    setMessagesByChat((prev) => {
      const existing = prev[activeChatId] || []
      const existingMap = new Map<number, MessageItem>()
      for (const m of existing) {
        existingMap.set(m.id, m)
      }
      for (const m of newMsgs) {
        existingMap.set(m.id, m)
      }
      const merged = Array.from(existingMap.values()).sort((a, b) => a.id - b.id)
      return { ...prev, [activeChatId]: merged }
    })
  }`,
  `const handleMergeHistoricalMessages = (newMsgs: MessageItem[]) => {
    if (!activeAccountId || !activeChatId || !newMsgs || newMsgs.length === 0) return
    const key = chatStoreKey(activeAccountId, activeChatId)
    setMessagesByChat((prev) => {
      const existing = prev[key] || []
      const existingMap = new Map<number, MessageItem>()
      for (const m of existing) existingMap.set(m.id, m)
      for (const m of newMsgs) existingMap.set(m.id, m)
      const merged = Array.from(existingMap.values()).sort((a, b) => a.id - b.id)
      return { ...prev, [key]: merged }
    })
  }`,
  'merge history by account'
)

app = mustReplace(
  app,
  `const handleSelectChat = (chatId: string) => {
    setActiveChatId(chatId)
    if (activeAccountId) {
      loadMessages(activeAccountId, chatId)
    }
  }`,
  `const handleSelectChat = (chatId: string, ownerAccountId?: string) => {
    const owner =
      ownerAccountId ||
      Object.values(dialogsByAccount).flat().find((d) => d.id === chatId)?.accountId ||
      activeAccountId
    if (!owner) return
    setActiveAccountId(owner)
    setActiveChatId(chatId)
    loadMessages(owner, chatId)
  }`,
  'auto route selected chat'
)

app = mustReplaceAll(
  app,
  'messagesByChat[activeChatId]',
  'messagesByChat[chatStoreKey(activeAccountId, activeChatId)]',
  'convert active chat cache reads',
  3
)
app = mustReplaceAll(
  app,
  '[activeChatId]:',
  '[chatStoreKey(activeAccountId, activeChatId)]:',
  'convert active chat cache writes',
  3
)

app = mustReplace(
  app,
  `const currentAccount = accounts.find((a) => a.id === activeAccountId) || null
  const currentDialogs = (activeAccountId && dialogsByAccount[activeAccountId]) || []
  const currentChat = currentDialogs.find((d) => d.id === activeChatId) || null
  const currentMessages = (activeChatId && messagesByChat[chatStoreKey(activeAccountId, activeChatId)]) || []`,
  `const currentAccount = accounts.find((a) => a.id === activeAccountId) || null
  const unifiedDialogs = useMemo(() => {
    const merged = Object.values(dialogsByAccount).flat()
    return [...merged].sort((a, b) => {
      if (Boolean(a.isPinned) !== Boolean(b.isPinned)) return a.isPinned ? -1 : 1
      return (b.lastMessageDate || 0) - (a.lastMessageDate || 0)
    })
  }, [dialogsByAccount])

  const currentDialogs = isUnifiedInboxOpen
    ? unifiedDialogs
    : (activeAccountId && dialogsByAccount[activeAccountId]) || []

  const currentChat =
    currentDialogs.find(
      (d) => d.id === activeChatId && (!isUnifiedInboxOpen || !activeAccountId || d.accountId === activeAccountId)
    ) || null

  const currentMessages =
    activeAccountId && activeChatId
      ? messagesByChat[chatStoreKey(activeAccountId, activeChatId)] || []
      : []`,
  'merge current dialogs'
)

app = mustReplace(
  app,
  `// Priority 3: Close Unified Inbox
        if (isUnifiedInboxOpen) {
          setIsUnifiedInboxOpen(false)
          return
        }
        // Priority 4: Deselect active chat (Telegram Desktop ESC behavior)`,
  `// Unified workspace is a primary mode, not a modal.
        // Priority 3: Deselect active chat (Telegram Desktop ESC behavior)`,
  'keep escape in unified workspace'
)

app = mustReplace(
  app,
  `if (isUnifiedInboxOpen) setIsUnifiedInboxOpen(false)`,
  `// Unified workspace remains active until the user explicitly selects an account.`,
  'remove secondary escape-close behavior'
)

app = mustReplace(
  app,
  `) : isUnifiedInboxOpen ? (`,
  `) : false && isUnifiedInboxOpen ? (`,
  'render the full Telegram workspace in unified mode'
)

app = mustReplace(
  app,
  `<ChatTabs
              accountId={currentAccount?.id}`,
  `<ChatTabs
              accountId={isUnifiedInboxOpen ? undefined : currentAccount?.id}`,
  'use standard tabs in unified mode'
)

app = mustReplace(
  app,
  `<ChatList
              account={currentAccount}
              dialogs={currentDialogs}
              activeChatId={activeChatId}`,
  `<ChatList
              account={isUnifiedInboxOpen ? null : currentAccount}
              activeAccountId={activeAccountId}
              dialogs={currentDialogs}
              activeChatId={activeChatId}`,
  'wire unified chat list'
)

app = mustReplaceAll(
  app,
  `cloudFolders={cloudFolders}`,
  `cloudFolders={isUnifiedInboxOpen ? [] : cloudFolders}`,
  'disable account-scoped folders in unified mode',
  2
)

app = mustReplace(
  app,
  `const handleMarkAllAsRead = async (category?: TabCategory): Promise<boolean> => {
    if (!activeAccountId || !window.guidegram) return false
    try {
      if (!category || category === 'all') {
        await window.guidegram.markAllAsRead(activeAccountId)
        setDialogsByAccount((prev) => {
          const list = prev[activeAccountId] || []
          return {
            ...prev,
            [activeAccountId]: list.map((d) => ({ ...d, unreadCount: 0 })),
          }
        })
      } else {
        const dialogs = dialogsByAccount[activeAccountId] || []
        const toMark = dialogs.filter((d) => {
          if (d.unreadCount <= 0) return false
          if (category === 'users') return d.isUser && !d.isBot
          if (category === 'groups') return d.isGroup
          if (category === 'channels') return d.isChannel
          if (category === 'bots') return d.isBot
          if (category === 'unread') return true
          return false
        })

        for (const d of toMark) {
          try {
            await window.guidegram.markAsRead(activeAccountId, d.id)
          } catch (err) {
            console.warn(\`Failed to mark dialog \${d.id} as read:\`, err)
          }
        }

        setDialogsByAccount((prev) => {
          const list = prev[activeAccountId] || []
          const toMarkIds = new Set(toMark.map((d) => d.id))
          return {
            ...prev,
            [activeAccountId]: list.map((d) =>
              toMarkIds.has(d.id) ? { ...d, unreadCount: 0 } : d
            ),
          }
        })
      }
      return true
    } catch (err) {
      console.error('Failed to mark all as read:', err)
      return false
    }
  }`,
  `const handleMarkAllAsRead = async (category?: TabCategory): Promise<boolean> => {
    if (!window.guidegram) return false
    try {
      const accountIds = isUnifiedInboxOpen
        ? accounts.filter((a) => a.status === 'connected').map((a) => a.id)
        : activeAccountId
          ? [activeAccountId]
          : []
      if (accountIds.length === 0) return false

      if (!category || category === 'all') {
        await Promise.all(accountIds.map((accountId) => window.guidegram.markAllAsRead(accountId)))
        setDialogsByAccount((prev) => {
          const next = { ...prev }
          for (const accountId of accountIds) {
            next[accountId] = (next[accountId] || []).map((d) => ({ ...d, unreadCount: 0 }))
          }
          return next
        })
      } else {
        const matches = (d: DialogItem) => {
          if (d.unreadCount <= 0) return false
          if (category === 'users') return d.isUser && !d.isBot
          if (category === 'groups') return d.isGroup || (d.isChannel && !(d.isBroadcast ?? !d.isGroup))
          if (category === 'channels') return d.isBroadcast ?? (d.isChannel && !d.isGroup)
          if (category === 'bots') return d.isBot
          if (category === 'unread') return true
          return false
        }
        const targets = accountIds.flatMap((accountId) =>
          (dialogsByAccount[accountId] || []).filter(matches).map((dialog) => ({ accountId, dialog }))
        )
        await Promise.all(
          targets.map(({ accountId, dialog }) =>
            window.guidegram.markAsRead(accountId, dialog.id).catch((err) => {
              console.warn(\`Failed to mark dialog \${accountId}:\${dialog.id} as read:\`, err)
            })
          )
        )
        const targetKeys = new Set(targets.map(({ accountId, dialog }) => \`\${accountId}:\${dialog.id}\`))
        setDialogsByAccount((prev) => {
          const next = { ...prev }
          for (const accountId of accountIds) {
            next[accountId] = (next[accountId] || []).map((d) =>
              targetKeys.has(\`\${accountId}:\${d.id}\`) ? { ...d, unreadCount: 0 } : d
            )
          }
          return next
        })
      }
      return true
    } catch (err) {
      console.error('Failed to mark all as read:', err)
      return false
    }
  }`,
  'mark all read across accounts'
)

write('src/App.tsx', app)

let list = read('src/components/ChatList.tsx')

list = mustReplace(
  list,
  `account: AccountInfo | null
  dialogs: DialogItem[]`,
  `account: AccountInfo | null
  activeAccountId?: string | null
  dialogs: DialogItem[]`,
  'add activeAccountId prop'
)

list = mustReplace(
  list,
  `onSelectChat: (chatId: string) => void`,
  `onSelectChat: (chatId: string, accountId?: string) => void`,
  'extend selection callback'
)

list = mustReplace(
  list,
  `account,
  dialogs,`,
  `account,
  activeAccountId,
  dialogs,`,
  'destructure activeAccountId'
)

list = mustReplace(
  list,
  `const handleSelectDialog = useCallback(
    (dialogId: string) => {
      if (searchQuery.trim()) saveRecentSearch(searchQuery.trim())
      onSelectChat(dialogId)
    },
    [searchQuery, onSelectChat, recentSearches]
  )`,
  `const handleSelectDialog = useCallback(
    (dialogId: string, ownerAccountId?: string) => {
      if (searchQuery.trim()) saveRecentSearch(searchQuery.trim())
      onSelectChat(dialogId, ownerAccountId)
    },
    [searchQuery, onSelectChat, recentSearches]
  )`,
  'route selected dialog owner'
)

list = mustReplaceAll(
  list,
  `key={dialog.id}`,
  `key={\`\${dialog.accountId}:\${dialog.id}\`}`,
  'unique merged dialog keys',
  2
)
list = mustReplaceAll(
  list,
  `isSelected={activeChatId === dialog.id}`,
  `isSelected={activeChatId === dialog.id && (!activeAccountId || activeAccountId === dialog.accountId)}`,
  'account-aware selection',
  2
)
list = mustReplaceAll(
  list,
  `onSelect={handleSelectDialog}`,
  `onSelect={(dialogId) => handleSelectDialog(dialogId, dialog.accountId)}`,
  'carry owner account on select',
  2
)
list = mustReplace(
  list,
  `onSelectChat(msg.chatId)`,
  `onSelectChat(msg.chatId, msg.accountId)`,
  'route global message result'
)

write('src/components/ChatList.tsx', list)


// ---------------------------------------------------------------------------
// Unified realtime correctness: active chat identity includes the account,
// and edit/delete events only touch the owner account's message cache.
// ---------------------------------------------------------------------------
app = read('src/App.tsx')

app = mustReplace(
  app,
  `const chatStoreKey = (accountId?: string | null, chatId?: string | null) =>
    accountId && chatId ? \`\${accountId}:\${chatId}\` : ''`,
  `const chatStoreKey = (accountId?: string | null, chatId?: string | null) =>
    accountId && chatId ? \`\${accountId}:\${chatId}\` : ''

  const activeAccountIdRef = useRef<string | null>(null)
  const activeChatIdRef = useRef<string | null>(null)
  useEffect(() => {
    activeAccountIdRef.current = activeAccountId
  }, [activeAccountId])
  useEffect(() => {
    activeChatIdRef.current = activeChatId
  }, [activeChatId])`,
  'add active account/chat refs'
)

app = mustReplace(
  app,
  `unreadCount: chatId !== activeChatId && !message?.isOutgoing ? 1 : 0,`,
  `unreadCount:
                !(chatId === activeChatIdRef.current && accountId === activeAccountIdRef.current) &&
                !message?.isOutgoing
                  ? 1
                  : 0,`,
  'make new-dialog unread account-aware'
)

app = mustReplace(
  app,
  `const shouldIncrement = chatId !== activeChatId && !message?.isOutgoing`,
  `const isActiveTarget =
              chatId === activeChatIdRef.current && accountId === activeAccountIdRef.current
            const shouldIncrement = !isActiveTarget && !message?.isOutgoing`,
  'make realtime unread increment account-aware'
)

app = mustReplace(
  app,
  `(isOutgoing || chatId === activeChatId ? 0 : d.unreadCount),`,
  `(isOutgoing || isActiveTarget ? 0 : d.unreadCount),`,
  'preserve unread from same chat id in another account'
)

app = mustReplace(
  app,
  `const { chatId, messageIds, isDeletedLocally, deletedAt } = payload`,
  `const { accountId, chatId, messageIds, isDeletedLocally, deletedAt } = payload`,
  'carry account id into delete event'
)

app = mustReplace(
  app,
  `const { chatId, message } = payload`,
  `const { accountId, chatId, message } = payload`,
  'carry account id into edit event'
)

app = mustReplaceAll(
  app,
  `const targetChatIds = chatId && prev[chatId] ? [chatId] : Object.keys(prev)`,
  `const targetKey = chatStoreKey(accountId, chatId)
            const targetChatIds = targetKey && prev[targetKey] ? [targetKey] : []`,
  'scope edit/delete cache events to owner account',
  2
)

write('src/App.tsx', app)

// ---------------------------------------------------------------------------
// Cross-account MTProto search. In unified mode search every account in
// parallel, keep account identity on each result, then de-duplicate safely.
// ---------------------------------------------------------------------------
list = read('src/components/ChatList.tsx')

list = mustReplace(
  list,
  `// Debounced Telegram MTProto Global Search
  const searchTimeoutRef = useRef<any>(null)
  useEffect(() => {
    if (!searchQuery.trim() || !account?.id) {
      setGlobalPeers([])
      setGlobalMessages([])
      setIsSearchingGlobal(false)
      return
    }

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)

    setIsSearchingGlobal(true)
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const query = searchQuery.trim()
        const [peersRes, msgsRes] = await Promise.all([
          window.guidegram?.searchPublicPeers?.(account.id, query),
          window.guidegram?.searchGlobal?.(
            account.id,
            query,
            searchFilter === 'all' ? undefined : searchFilter
          ),
        ])

        // Filter out peers already in local dialogs
        const existingIds = new Set(dialogs.map((d) => d.id))
        const uniquePeers = (peersRes || []).filter((p) => !existingIds.has(p.id))

        setGlobalPeers(uniquePeers)
        setGlobalMessages(msgsRes || [])
      } catch (err) {
        console.warn('Global search error:', err)
      } finally {
        setIsSearchingGlobal(false)
      }
    }, 350)

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    }
  }, [searchQuery, searchFilter, account?.id, dialogs])`,
  `// Debounced Telegram MTProto Global Search.
  // account === null means Unified Workspace, so query every loaded account.
  const searchTimeoutRef = useRef<any>(null)
  useEffect(() => {
    const accountIds = account?.id
      ? [account.id]
      : Array.from(new Set(dialogs.map((d) => d.accountId).filter(Boolean)))

    if (!searchQuery.trim() || accountIds.length === 0) {
      setGlobalPeers([])
      setGlobalMessages([])
      setIsSearchingGlobal(false)
      return
    }

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)

    setIsSearchingGlobal(true)
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const query = searchQuery.trim()
        const perAccount = await Promise.all(
          accountIds.map(async (accountId) => {
            const [peersRes, msgsRes] = await Promise.all([
              window.guidegram?.searchPublicPeers?.(accountId, query),
              window.guidegram?.searchGlobal?.(
                accountId,
                query,
                searchFilter === 'all' ? undefined : searchFilter
              ),
            ])
            return {
              accountId,
              peers: (peersRes || []).map((p) => ({ ...p, accountId: p.accountId || accountId })),
              messages: (msgsRes || []).map((m) => ({ ...m, accountId: m.accountId || accountId })),
            }
          })
        )

        const existingKeys = new Set(dialogs.map((d) => \`\${d.accountId}:\${d.id}\`))
        const peerMap = new Map<string, DialogItem>()
        for (const result of perAccount) {
          for (const peer of result.peers) {
            const key = \`\${peer.accountId}:\${peer.id}\`
            if (!existingKeys.has(key) && !peerMap.has(key)) peerMap.set(key, peer)
          }
        }

        const messageMap = new Map<string, MessageItem>()
        for (const result of perAccount) {
          for (const message of result.messages) {
            const key = \`\${message.accountId}:\${message.chatId}:\${message.id}\`
            if (!messageMap.has(key)) messageMap.set(key, message)
          }
        }

        setGlobalPeers(Array.from(peerMap.values()))
        setGlobalMessages(
          Array.from(messageMap.values()).sort((a, b) => (b.date || 0) - (a.date || 0))
        )
      } catch (err) {
        console.warn('Global search error:', err)
      } finally {
        setIsSearchingGlobal(false)
      }
    }, 350)

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    }
  }, [searchQuery, searchFilter, account?.id, dialogs])`,
  'search all accounts in unified mode'
)

list = mustReplace(
  list,
  `onSelectChat(peer.id)`,
  `onSelectChat(peer.id, peer.accountId)`,
  'route global peer result through owner account'
)

list = mustReplace(
  list,
  `accountId={account?.id || ''}`,
  `accountId={peer.accountId || account?.id || ''}`,
  'load global peer avatar through owner account'
)

list = mustReplace(
  list,
  `if (onSelectPeer && peer.username) {`,
  `if (account && onSelectPeer && peer.username) {`,
  'keep public-peer username resolution account-specific'
)

list = mustReplace(
  list,
  `key={\`peer-\${peer.id}\`}`,
  `key={\`peer-\${peer.accountId}-\${peer.id}\`}`,
  'make cross-account public peer keys unique'
)

write('src/components/ChatList.tsx', list)

console.log('Unified Telegram patch applied successfully.')
