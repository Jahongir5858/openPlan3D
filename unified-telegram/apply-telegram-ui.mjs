import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(process.argv[2] || process.cwd())
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n')
const write = (rel, value) => fs.writeFileSync(path.join(root, rel), value, 'utf8')
function rep(src, from, to, label) {
  if (!src.includes(from)) throw new Error('UI patch failed: ' + label)
  return src.replace(from, to)
}
function repAll(src, from, to, label, min = 1) {
  const count = src.split(from).length - 1
  if (count < min) throw new Error('UI patch failed: ' + label + ' (' + count + ')')
  return src.split(from).join(to)
}

// App wiring
let app = read('src/App.tsx')
app = rep(app,
  '<TitleBar\n        activeAccount={currentAccount}\n        ghostMode={ghostMode}',
  '<TitleBar\n        activeAccount={currentAccount}\n        unified={isUnifiedInboxOpen}\n        ghostMode={ghostMode}',
  'titlebar unified prop')
app = rep(app,
  '<ChatList\n              account={isUnifiedInboxOpen ? null : currentAccount}\n              activeAccountId={activeAccountId}\n              dialogs={currentDialogs}',
  '<ChatList\n              account={isUnifiedInboxOpen ? null : currentAccount}\n              accounts={accounts}\n              activeAccountId={activeAccountId}\n              dialogs={currentDialogs}',
  'chatlist accounts prop')
app = rep(app,
  '<ChatViewport\n            chat={currentChat}\n            messages={currentMessages}',
  '<ChatViewport\n            chat={currentChat}\n            accounts={accounts}\n            messages={currentMessages}',
  'viewport accounts prop')
app = rep(app,
  'className="shrink-0 flex flex-col h-full bg-dark-850 overflow-hidden"',
  'className="shrink-0 flex flex-col h-full bg-[#17212b] overflow-hidden border-r border-[#101820]"',
  'sidebar surface')
app = rep(app,
  'className="w-1.5 hover:w-2 bg-white/5 hover:bg-primary-500/50 active:bg-primary-500 cursor-col-resize shrink-0 transition-all z-20 group relative flex items-center justify-center"',
  'className="w-px bg-[#101820] hover:bg-[#3390ec] cursor-col-resize shrink-0 z-20 group relative flex items-center justify-center"',
  'splitter')
app = rep(app,
  '<div className="w-0.5 h-6 bg-white/20 group-hover:bg-white rounded-full transition-colors" />',
  '<div className="w-px h-full bg-transparent" />',
  'splitter handle')
write('src/App.tsx', app)

// Chat list account ownership + Telegram-style rows
let list = read('src/components/ChatList.tsx')
list = rep(list,
  'account: AccountInfo | null\n  activeAccountId?: string | null',
  'account: AccountInfo | null\n  accounts?: AccountInfo[]\n  activeAccountId?: string | null',
  'ChatList accounts type')
list = rep(list,
  'account,\n  activeAccountId,\n  dialogs,',
  'account,\n  accounts = [],\n  activeAccountId,\n  dialogs,',
  'ChatList accounts destructure')
list = rep(list,
  'interface DialogListItemProps {\n  dialog: DialogItem\n  isSelected: boolean',
  'interface DialogListItemProps {\n  dialog: DialogItem\n  ownerAccount?: AccountInfo\n  ownerIndex?: number\n  showOwnerAccount?: boolean\n  isSelected: boolean',
  'DialogListItem owner props')
list = rep(list,
  '({ dialog, isSelected, showChatId, formatTime, formatNumber, t, onSelect }) => {',
  '({ dialog, ownerAccount, ownerIndex = 1, showOwnerAccount = false, isSelected, showChatId, formatTime, formatNumber, t, onSelect }) => {',
  'DialogListItem owner destructure')
list = repAll(list,
  'dialog={dialog}\n                    isSelected=',
  'dialog={dialog}\n                    ownerAccount={accounts.find((a) => a.id === dialog.accountId)}\n                    ownerIndex={Math.max(1, accounts.findIndex((a) => a.id === dialog.accountId) + 1)}\n                    showOwnerAccount={!account}\n                    isSelected=',
  'owner props search row', 1)
list = repAll(list,
  'dialog={dialog}\n              isSelected=',
  'dialog={dialog}\n              ownerAccount={accounts.find((a) => a.id === dialog.accountId)}\n              ownerIndex={Math.max(1, accounts.findIndex((a) => a.id === dialog.accountId) + 1)}\n              showOwnerAccount={!account}\n              isSelected=',
  'owner props normal row', 1)
list = rep(list,
  'className={`px-3 py-2.5 transition-colors cursor-pointer border-b border-white/5 relative group ${\n          isSelected ? \'bg-primary-600/20\' : \'hover:bg-dark-800/60\'\n        }`}',
  'className={`px-3 py-[9px] transition-colors cursor-pointer relative group ${\n          isSelected ? \'bg-[#2b5278]\' : \'hover:bg-[#202b36]\'\n        }`}',
  'dialog row style')
list = rep(list,
  '<div className="relative shrink-0">\n            <Avatar\n              accountId={dialog.accountId}\n              peerId={dialog.id}\n              title={dialog.title}\n              initials={dialog.avatarInitials}\n              avatarUrl={dialog.avatarUrl}\n              size="md"\n            />\n          </div>',
  '<div className="relative shrink-0">\n            <Avatar\n              accountId={dialog.accountId}\n              peerId={dialog.id}\n              title={dialog.title}\n              initials={dialog.avatarInitials}\n              avatarUrl={dialog.avatarUrl}\n              size="md"\n            />\n            {showOwnerAccount && ownerAccount && (\n              <div title={`Account ${ownerIndex}: ${ownerAccount.firstName || \'User\'} ${ownerAccount.lastName || \'\'} ${ownerAccount.phone || \'\'}`} className="absolute -right-1 -bottom-1 w-[22px] h-[22px] rounded-full ring-2 ring-[#17212b] bg-[#17212b] overflow-hidden shadow-sm">\n                <Avatar accountId={ownerAccount.id} peerId={ownerAccount.id} title={ownerAccount.firstName || \'User\'} initials={`${ownerAccount.firstName?.[0] || \'A\'}${ownerAccount.lastName?.[0] || \'\'}`} avatarUrl={ownerAccount.avatarUrl} size="xs" className="w-full h-full" />\n                <span className="absolute -right-[1px] -bottom-[1px] min-w-[11px] h-[11px] px-[2px] rounded-full bg-[#3390ec] text-white text-[7px] leading-[11px] text-center font-bold ring-1 ring-[#17212b]">{ownerIndex}</span>\n              </div>\n            )}\n          </div>',
  'owner avatar badge')
list = rep(list,
  '<span className="truncate">\n                      {dialog.lastMessageText || \'...\'}\n                    </span>',
  '<span className="truncate">\n                      {showOwnerAccount && ownerAccount && (\n                        <span className={`font-semibold ${isSelected ? \'text-white/90\' : \'text-[#6ab2f2]\'}`}>{ownerIndex}. {ownerAccount.firstName || ownerAccount.phone || \'Account\'} · </span>\n                      )}\n                      {dialog.lastMessageText || \'...\'}\n                    </span>',
  'owner name in preview')
list = rep(list,
  'className="w-full flex-1 min-h-0 bg-dark-850 flex flex-col select-none titlebar-no-drag"',
  'className="w-full flex-1 min-h-0 bg-[#17212b] flex flex-col select-none titlebar-no-drag"',
  'chat list surface')
list = rep(list,
  'className="w-full bg-dark-800 border border-white/5 rounded-xl pl-9 pr-8 py-2 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-primary-500/50 transition-colors"',
  'className="w-full h-9 bg-[#202b36] border border-transparent rounded-[18px] pl-9 pr-8 text-[13px] text-[#f5f5f5] placeholder-[#7f91a4] focus:outline-none focus:border-[#3390ec] transition-colors"',
  'search field')
list = rep(list,
  'className="p-2.5 shrink-0 relative"',
  'className="px-3 pt-2.5 pb-2 shrink-0 relative"',
  'search spacing')
write('src/components/ChatList.tsx', list)

// Flat Telegram-like folder tabs
let tabs = read('src/components/ChatTabs.tsx')
tabs = rep(tabs,
  'className="w-full shrink-0 flex items-center gap-1 px-2.5 py-2 border-b border-white/5 overflow-x-auto scrollbar-none titlebar-no-drag relative"',
  'className="w-full h-10 shrink-0 flex items-end gap-0 px-1 border-b border-[#101820] overflow-x-auto scrollbar-none titlebar-no-drag relative bg-[#17212b]"',
  'tabs container')
tabs = rep(tabs,
  'className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all duration-150 cursor-pointer ${\n                isActive\n                  ? \'bg-primary-600/20 text-primary-400 border border-primary-500/30 shadow-sm\'\n                  : \'text-gray-400 hover:text-gray-200 hover:bg-white/5\'\n              }`}',
  'className={`relative h-10 flex items-center gap-1.5 px-3 text-[12px] font-semibold whitespace-nowrap transition-colors cursor-pointer ${\n                isActive\n                  ? \'text-[#6ab2f2] after:absolute after:left-2 after:right-2 after:bottom-0 after:h-[2px] after:bg-[#3390ec] after:rounded-t\'\n                  : \'text-[#8e9cab] hover:text-[#d7e0e8] hover:bg-[#202b36]\'\n              }`}',
  'tab style')
write('src/components/ChatTabs.tsx', tabs)

// ChatViewport owner account identity
let viewport = read('src/components/ChatViewport.tsx')
viewport = rep(viewport,
  "import { DialogItem, MessageItem, ChatDetails, MessageEntityItem, WebPagePreview, CustomEmojiPayload, ForumTopicItem, ScheduledMessageItem, MessageReactionItem, StickerItem, ChannelBoostStatus, AutoDownloadConfig } from '../types/telegram'",
  "import { DialogItem, AccountInfo, MessageItem, ChatDetails, MessageEntityItem, WebPagePreview, CustomEmojiPayload, ForumTopicItem, ScheduledMessageItem, MessageReactionItem, StickerItem, ChannelBoostStatus, AutoDownloadConfig } from '../types/telegram'",
  'viewport AccountInfo import')
viewport = rep(viewport,
  'chat: DialogItem | null\n  messages: MessageItem[]',
  'chat: DialogItem | null\n  accounts?: AccountInfo[]\n  messages: MessageItem[]',
  'viewport accounts prop')
viewport = rep(viewport,
  '  chat,\n  messages,',
  '  chat,\n  accounts = [],\n  messages,',
  'viewport accounts destructure')
viewport = rep(viewport,
  'const isChannel = chat.isChannel\n  const isGroup = chat.isGroup\n  const isBot = chat.isBot',
  'const isChannel = chat.isChannel\n  const isGroup = chat.isGroup\n  const isBot = chat.isBot\n  const ownerAccount = accounts.find((a) => a.id === chat.accountId)\n  const ownerIndex = Math.max(1, accounts.findIndex((a) => a.id === chat.accountId) + 1)\n  const ownerLabel = ownerAccount ? `Account ${ownerIndex} · ${ownerAccount.firstName || ownerAccount.phone || \'Account\'}${ownerAccount.phone ? ` · ${ownerAccount.phone}` : \'\'}` : `Account ${ownerIndex}`',
  'viewport owner lookup')
viewport = rep(viewport,
  'className="relative flex-1 min-w-0 bg-dark-900 flex flex-col h-full overflow-hidden titlebar-no-drag"',
  'className="relative flex-1 min-w-0 bg-[#0e1621] flex flex-col h-full overflow-hidden titlebar-no-drag"',
  'chat background')
viewport = rep(viewport,
  'className="h-16 shrink-0 bg-dark-850/90 border-b border-white/5 px-4 flex items-center justify-between backdrop-blur-md z-20 shadow-sm"',
  'className="h-[56px] shrink-0 bg-[#17212b] border-b border-[#101820] px-3.5 flex items-center justify-between z-20"',
  'chat header style')
viewport = rep(viewport,
  '<div className="text-[11px] text-gray-400 truncate">\n              {isChannel\n                ? \'Broadcast Channel\'\n                : isGroup\n                ? \'Group Chat\'\n                : isBot\n                ? \'Bot\'\n                : \'Online\'}\n            </div>',
  '<div className="text-[11px] text-[#8e9cab] truncate flex items-center gap-1.5">\n              <span className="text-[#6ab2f2] font-medium">{ownerLabel}</span><span>•</span><span>{isChannel ? \'channel\' : isGroup ? \'group\' : isBot ? \'bot\' : \'online\'}</span>\n            </div>',
  'chat header owner label')
write('src/components/ChatViewport.tsx', viewport)

// Telegram-like title bar
const titleBar = [
  "import React, { useState } from 'react'",
  "import { Minus, Square, X, Menu } from 'lucide-react'",
  "import { AccountInfo } from '../types/telegram'",
  '',
  'interface TitleBarProps {',
  '  activeAccount: AccountInfo | null',
  '  unified?: boolean',
  '  ghostMode: boolean',
  '  onRequestClose?: () => void',
  '  onToggleMainMenu?: () => void',
  '}',
  '',
  'export const TitleBar: React.FC<TitleBarProps> = ({ activeAccount, unified = false, onRequestClose, onToggleMainMenu }) => {',
  '  const [isMax, setIsMax] = useState(false)',
  '  const minimize = () => window.guidegram?.minimizeWindow?.()',
  '  const maximize = async () => { if (window.guidegram?.maximizeWindow) setIsMax(await window.guidegram.maximizeWindow()) }',
  '  const close = () => onRequestClose ? onRequestClose() : window.guidegram?.closeWindow?.()',
  '  return (',
  '    <header className="h-9 bg-[#17212b] border-b border-[#101820] flex items-center justify-between select-none titlebar-drag z-50">',
  '      <div className="flex items-center h-full titlebar-no-drag">',
  '        <button onClick={onToggleMainMenu} title="Menu" className="w-12 h-9 flex items-center justify-center text-[#9fb1c1] hover:text-white hover:bg-[#202b36]"><Menu className="w-[18px] h-[18px]" /></button>',
  '        <span className="text-[13px] font-semibold text-[#e8edf2]">Unified Telegram</span>',
  '        <span className="ml-2 text-[11px] text-[#7f91a4]">{unified ? \'All accounts\' : activeAccount ? `${activeAccount.firstName || \'Account\'}${activeAccount.phone ? ` · ${activeAccount.phone}` : \'\'}` : \'\'}</span>',
  '      </div>',
  '      <div className="flex-1 h-full titlebar-drag" />',
  '      <div className="flex items-center h-full titlebar-no-drag">',
  '        <button onClick={minimize} className="w-11 h-9 flex items-center justify-center text-[#9fb1c1] hover:text-white hover:bg-[#263442]"><Minus className="w-4 h-4" /></button>',
  '        <button onClick={maximize} title={isMax ? \'Restore\' : \'Maximize\'} className="w-11 h-9 flex items-center justify-center text-[#9fb1c1] hover:text-white hover:bg-[#263442]"><Square className="w-3 h-3" /></button>',
  '        <button onClick={close} className="w-11 h-9 flex items-center justify-center text-[#9fb1c1] hover:text-white hover:bg-[#e05252]"><X className="w-4 h-4" /></button>',
  '      </div>',
  '    </header>',
  '  )',
  '}',
].join('\n')
write('src/components/TitleBar.tsx', titleBar)

// Compact account rail: numeric identity is always visible.
const dock = [
  "import React from 'react'",
  "import { Plus, Inbox, Settings } from 'lucide-react'",
  "import { AccountInfo } from '../types/telegram'",
  "import { Avatar } from './Avatar'",
  '',
  'interface AccountDockProps { accounts: AccountInfo[]; activeAccountId: string | null; isUnifiedInboxOpen: boolean; onSelectAccount: (accountId: string) => void; onOpenAddAccount: () => void; onToggleUnifiedInbox: () => void; onOpenProxyModal: () => void; onOpenSettings: () => void }',
  'export const AccountDock: React.FC<AccountDockProps> = ({ accounts, activeAccountId, isUnifiedInboxOpen, onSelectAccount, onOpenAddAccount, onToggleUnifiedInbox, onOpenSettings }) => {',
  '  const totalUnread = accounts.reduce((sum, a) => sum + (a.unreadTotal || 0), 0)',
  '  return (',
  '    <aside className="w-[54px] shrink-0 h-full bg-[#17212b] border-r border-[#101820] flex flex-col items-center select-none z-20 titlebar-no-drag">',
  '      <button onClick={onToggleUnifiedInbox} title="All accounts" className={`relative mt-2 w-10 h-10 rounded-full flex items-center justify-center transition-colors ${isUnifiedInboxOpen ? \'bg-[#3390ec] text-white\' : \'text-[#9fb1c1] hover:text-white hover:bg-[#202b36]\'}`}>',
  '        <Inbox className="w-[19px] h-[19px]" />',
  '        {totalUnread > 0 && <span className="absolute -right-1 -top-1 min-w-[17px] h-[17px] px-1 rounded-full bg-[#3390ec] text-white text-[9px] leading-[17px] font-semibold ring-2 ring-[#17212b]">{totalUnread > 99 ? \'99+\' : totalUnread}</span>}',
  '      </button>',
  '      <div className="w-8 h-px bg-[#263442] my-2" />',
  '      <div className="flex-1 w-full overflow-y-auto overflow-x-hidden flex flex-col items-center gap-2 px-1">',
  '        {accounts.map((acc, index) => { const active = !isUnifiedInboxOpen && acc.id === activeAccountId; const name = `${acc.firstName || \'Account\'} ${acc.lastName || \'\'}`.trim(); return (',
  '          <button key={acc.id} onClick={() => onSelectAccount(acc.id)} title={`Account ${index + 1}: ${name}${acc.phone ? ` (${acc.phone})` : \'\'}`} className={`relative w-10 h-10 rounded-full transition-all ${active ? \'ring-2 ring-[#3390ec] ring-offset-2 ring-offset-[#17212b]\' : \'opacity-90 hover:opacity-100\'}`}>',
  '            <Avatar accountId={acc.id} peerId={acc.id} title={name} initials={`${acc.firstName?.[0] || \'A\'}${acc.lastName?.[0] || \'\'}`} avatarUrl={acc.avatarUrl} size="md" className="w-full h-full rounded-full" />',
  '            <span className="absolute -right-1 -bottom-1 min-w-[15px] h-[15px] px-[3px] rounded-full bg-[#3390ec] text-white text-[8px] leading-[15px] font-bold ring-2 ring-[#17212b]">{index + 1}</span>',
  '            {acc.status === \'connected\' && <span className="absolute left-0 bottom-0 w-2.5 h-2.5 rounded-full bg-[#5dc452] ring-2 ring-[#17212b]" />}',
  '          </button>',
  '        )})}',
  '        <button onClick={onOpenAddAccount} title="Add account" className="w-10 h-10 rounded-full border border-[#344657] text-[#9fb1c1] hover:text-white hover:bg-[#202b36] flex items-center justify-center"><Plus className="w-[18px] h-[18px]" /></button>',
  '      </div>',
  '      <div className="w-8 h-px bg-[#263442] my-2" />',
  '      <button onClick={onOpenSettings} title="Settings" className="w-10 h-10 mb-2 rounded-full text-[#9fb1c1] hover:text-white hover:bg-[#202b36] flex items-center justify-center"><Settings className="w-[18px] h-[18px]" /></button>',
  '    </aside>',
  '  )',
  '}',
].join('\n')
write('src/components/AccountDock.tsx', dock)

// Theme palette
let tw = read('tailwind.config.js')
tw = rep(tw,
  "dark: {\n          950: '#08090C',\n          900: '#0D0F14',\n          850: '#12151C',\n          800: '#171B24',\n          750: '#1E232E',\n          700: '#252C3A',\n          600: '#323B4E',\n        },",
  "dark: {\n          950: '#0e1621',\n          900: '#17212b',\n          850: '#17212b',\n          800: '#202b36',\n          750: '#242f3d',\n          700: '#2f3b49',\n          600: '#3a4754',\n        },",
  'dark palette')
tw = rep(tw,
  "'glow': '0 0 25px -4px rgba(57, 198, 164, 0.38)',\n        'glow-emerald': '0 0 20px -3px rgba(16, 185, 129, 0.3)',",
  "'glow': '0 1px 2px rgba(0,0,0,0.18)',\n        'glow-emerald': '0 1px 2px rgba(0,0,0,0.18)',",
  'remove neon glow')
write('tailwind.config.js', tw)

let css = read('src/index.css')
css += '\n\n/* Unified Telegram desktop presentation */\nhtml,body,#root{background:#0e1621;}\nbody{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;color:#f5f5f5;}\n::-webkit-scrollbar{width:6px;height:6px;}\n::-webkit-scrollbar-thumb{background:rgba(127,145,164,.38);border-radius:6px;}\n::-webkit-scrollbar-thumb:hover{background:rgba(127,145,164,.58);}\n.glass-panel,.glass-modal{backdrop-filter:none!important;-webkit-backdrop-filter:none!important;}\n.shadow-glow,.shadow-glow-emerald{box-shadow:0 1px 2px rgba(0,0,0,.18)!important;}\n'
write('src/index.css', css)

let builder = read('electron-builder.json')
builder = rep(builder, '"appId": "com.doctorguidance.guidegram",\n  "productName": "Guidegram",', '"appId": "com.unifiedtelegram.desktop",\n  "productName": "Unified Telegram",', 'product name')
builder = rep(builder, '"shortcutName": "Guidegram",', '"shortcutName": "Unified Telegram",', 'shortcut name')
write('electron-builder.json', builder)

console.log('Telegram Desktop style UI patch applied.')