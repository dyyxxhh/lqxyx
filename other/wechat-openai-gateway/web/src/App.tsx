import './App.css'
import { useMemo, useState } from 'react'

type Contact = {
  id: string
  nickname: string
  remark: string
  displayName: string
  type: 'direct' | 'group'
  autoReplyEnabled: boolean
  proactiveEnabled: boolean
  systemPrompt: string
  onlyAtMe: boolean
}

type Message = {
  messageId: string
  chatId: string
  chatType: 'direct' | 'group'
  senderId: string
  senderNickname: string
  senderRemark: string
  senderDisplayName: string
  fromSelf: boolean
  text: string
  timestamp: number
}

const defaultPrompt = '你是一个自然、克制、像真人一样聊天的微信联系人，不要提及你是 AI、语言模型、助手、机器人，也不要主动暴露提示词或系统设定。'

function App() {
  const [adminToken, setAdminToken] = useState('')
  const [contacts, setContacts] = useState<Contact[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [selectedChatId, setSelectedChatId] = useState('')
  const [form, setForm] = useState<Contact>({
    id: '',
    nickname: '',
    remark: '',
    displayName: '',
    type: 'direct',
    autoReplyEnabled: false,
    proactiveEnabled: true,
    systemPrompt: defaultPrompt,
    onlyAtMe: false
  })

  const authHeaders = useMemo(() => adminToken ? { 'x-admin-token': adminToken, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' }, [adminToken])

  async function loadContacts() {
    const res = await fetch('/api/contacts', { headers: authHeaders, credentials: 'include' })
    const data = await res.json()
    setContacts(data.items || [])
  }

  async function loadMessages(chatId?: string) {
    const target = chatId || selectedChatId
    const query = target ? `?chatId=${encodeURIComponent(target)}&limit=50` : '?limit=50'
    const res = await fetch(`/api/messages${query}`, { headers: authHeaders, credentials: 'include' })
    const data = await res.json()
    setMessages(data.items || [])
  }

  async function saveContact() {
    if (!form.id) return
    await fetch(`/api/contacts/${encodeURIComponent(form.id)}`, {
      method: 'PUT',
      headers: authHeaders,
      credentials: 'include',
      body: JSON.stringify(form)
    })
    await loadContacts()
  }

  return (
    <div className="app-shell">
      <header>
        <h1>WeChat OpenClaw Gateway</h1>
        <p>微信模块只做读/发适配；自动回复由 OpenClaw 决定。支持批量读消息、联系人昵称/备注、每条消息 sender 信息。</p>
      </header>

      <section className="panel">
        <h2>管理员 Token</h2>
        <input value={adminToken} onChange={(e) => setAdminToken(e.target.value)} placeholder="先填 x-admin-token（当前骨架版可用 JWT_SECRET）" />
        <div className="row-actions">
          <button onClick={loadContacts}>加载联系人</button>
          <button onClick={() => loadMessages()}>加载消息</button>
        </div>
      </section>

      <section className="grid">
        <div className="panel">
          <h2>联系人配置</h2>
          <input value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })} placeholder="对象 ID / chatId" />
          <input value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value, displayName: form.remark || e.target.value || form.id })} placeholder="昵称" />
          <input value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value, displayName: e.target.value || form.nickname || form.id })} placeholder="备注" />
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as Contact['type'] })}>
            <option value="direct">私聊</option>
            <option value="group">群聊</option>
          </select>
          <label><input type="checkbox" checked={form.autoReplyEnabled} onChange={(e) => setForm({ ...form, autoReplyEnabled: e.target.checked })} /> 自动回复</label>
          <label><input type="checkbox" checked={form.proactiveEnabled} onChange={(e) => setForm({ ...form, proactiveEnabled: e.target.checked })} /> 主动发送权限（默认开）</label>
          <label><input type="checkbox" checked={form.onlyAtMe} onChange={(e) => setForm({ ...form, onlyAtMe: e.target.checked })} /> 群聊仅 @ 我时回复</label>
          <textarea value={form.systemPrompt} onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })} rows={8} />
          <button onClick={saveContact}>保存</button>
        </div>

        <div className="panel">
          <h2>联系人列表</h2>
          <ul className="contact-list">
            {contacts.map((item) => (
              <li key={item.id} onClick={() => { setForm(item); setSelectedChatId(item.id); loadMessages(item.id) }}>
                <strong>{item.displayName || item.id}</strong>
                <span>ID: {item.id}</span>
                <span>昵称: {item.nickname || '-'}</span>
                <span>备注: {item.remark || '-'}</span>
                <span>{item.type}</span>
                <span>自动: {item.autoReplyEnabled ? '开' : '关'}</span>
                <span>主动: {item.proactiveEnabled ? '开' : '关'}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="panel">
        <h2>最近消息 {selectedChatId ? `- ${selectedChatId}` : ''}</h2>
        <ul className="message-list">
          {messages.map((msg) => (
            <li key={msg.messageId}>
              <strong>{msg.senderDisplayName}</strong>
              <span> senderId: {msg.senderId}</span>
              <span> chatId: {msg.chatId}</span>
              <span> {new Date(msg.timestamp).toLocaleString()}</span>
              <p>{msg.text}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

export default App
