import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import './App.css'

const STORAGE_KEY = 'discipline-control-system-data'
const REMOTE_STATE_ROW_ID = 'main'
const LONG_PRESS_MS = 5000
const MAX_GROUP_AUTH_ATTEMPTS = 3
const GROUP_AUTH_BLOCK_MS = 30000

const CATEGORIES = ['Финансы', 'Бизнес', 'Здоровье', 'Семья', 'Окружение', 'Яркость жизни']
const MONTHS = [
  { value: '01', label: 'Янв' },
  { value: '02', label: 'Фев' },
  { value: '03', label: 'Мар' },
  { value: '04', label: 'Апр' },
  { value: '05', label: 'Май' },
  { value: '06', label: 'Июн' },
  { value: '07', label: 'Июл' },
  { value: '08', label: 'Авг' },
  { value: '09', label: 'Сен' },
  { value: '10', label: 'Окт' },
  { value: '11', label: 'Ноя' },
  { value: '12', label: 'Дек' },
]

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const HAS_SUPABASE_CONFIG = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)
const supabase = HAS_SUPABASE_CONFIG ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null
const DEFAULT_ADMIN = { codeWordHash: null, codeWordVersion: 1 }

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function hashText(value) {
  const encoded = new TextEncoder().encode(value)
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded)
  return toHex(hashBuffer)
}

function createGoal(goal, dueDate, successActions, failActions, isDone = false) {
  return { id: crypto.randomUUID(), goal, dueDate, successActions, failActions, isDone }
}

function createEmptyGoal() {
  return createGoal('', '', '', '', false)
}

function createEmptyCategories() {
  const categories = {}
  for (const category of CATEGORIES) {
    categories[category] = { months: [createEmptyGoal()], year: [createEmptyGoal()] }
  }
  return categories
}

function isGoalEmpty(goal) {
  return (
    (goal.goal ?? '').trim() === '' &&
    (goal.dueDate ?? '').trim() === '' &&
    (goal.successActions ?? '').trim() === '' &&
    (goal.failActions ?? '').trim() === '' &&
    goal.isDone === false
  )
}

function getCategoryProgressByMonth(goals, month) {
  const monthlyGoals = goals.filter((goal) => !isGoalEmpty(goal) && (goal.dueDate ?? '').slice(5, 7) === month)
  const total = monthlyGoals.length
  const completed = monthlyGoals.filter((goal) => goal.isDone).length
  return { total, completed, percent: total === 0 ? 0 : Math.round((completed / total) * 100) }
}

function getCategoryProgressByYear(goals) {
  const yearGoals = goals.filter((goal) => !isGoalEmpty(goal))
  const total = yearGoals.length
  const completed = yearGoals.filter((goal) => goal.isDone).length
  return { total, completed, percent: total === 0 ? 0 : Math.round((completed / total) * 100) }
}

function normalizePerson(person) {
  const sourceCategories = person?.categories ?? {}
  const normalizedCategories = {}
  for (const category of CATEGORIES) {
    const value = sourceCategories[category]
    normalizedCategories[category] = Array.isArray(value)
      ? { months: value, year: [createEmptyGoal()] }
      : {
          months: Array.isArray(value?.months) ? value.months : [createEmptyGoal()],
          year: Array.isArray(value?.year) ? value.year : [createEmptyGoal()],
        }
  }
  return { id: person?.id ?? crypto.randomUUID(), name: person?.name ?? 'Без имени', categories: normalizedCategories }
}

function normalizeGroupsData(payload) {
  if (!Array.isArray(payload)) {
    return []
  }
  const looksLikeGroups = payload.every((item) => item && typeof item === 'object' && Array.isArray(item.people))
  if (!looksLikeGroups) {
    return []
  }
  return payload.map((group) => ({
    id: group?.id ?? crypto.randomUUID(),
    name: group?.name ?? 'Без названия',
    people: Array.isArray(group.people) ? group.people.map(normalizePerson) : [],
    passwordHash: typeof group?.passwordHash === 'string' ? group.passwordHash : null,
  }))
}

function normalizePayload(raw) {
  if (Array.isArray(raw)) {
    return { groups: normalizeGroupsData(raw), admin: DEFAULT_ADMIN }
  }
  if (!raw || typeof raw !== 'object') {
    return { groups: [], admin: DEFAULT_ADMIN }
  }
  return {
    groups: normalizeGroupsData(raw.groups),
    admin: {
      codeWordHash: typeof raw?.admin?.codeWordHash === 'string' ? raw.admin.codeWordHash : null,
      codeWordVersion:
        typeof raw?.admin?.codeWordVersion === 'number' && raw.admin.codeWordVersion > 0
          ? raw.admin.codeWordVersion
          : 1,
    },
  }
}

function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return { groups: [], admin: DEFAULT_ADMIN }
  try {
    return normalizePayload(JSON.parse(raw))
  } catch (error) {
    console.error('Не удалось прочитать данные:', error)
    return { groups: [], admin: DEFAULT_ADMIN }
  }
}

function saveDataToLocalStorage(payload) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
}

async function loadDataFromServerOrLocal() {
  if (!supabase) {
    return { payload: loadData(), storageMode: 'local' }
  }
  const { data, error } = await supabase.from('people_data').select('data').eq('id', REMOTE_STATE_ROW_ID).maybeSingle()
  if (error) {
    console.error('Ошибка чтения из Supabase, включен localStorage fallback:', error.message)
    return { payload: loadData(), storageMode: 'local' }
  }
  if (data?.data) {
    return { payload: normalizePayload(data.data), storageMode: 'remote' }
  }
  return { payload: loadData(), storageMode: 'remote' }
}

async function saveDataToServer(payload) {
  if (!supabase) {
    saveDataToLocalStorage(payload)
    return 'local'
  }
  const { error } = await supabase.from('people_data').upsert(
    { id: REMOTE_STATE_ROW_ID, data: payload, updated_at: new Date().toISOString() },
    { onConflict: 'id' },
  )
  if (error) {
    console.error('Ошибка сохранения в Supabase, записано только в localStorage:', error.message)
    saveDataToLocalStorage(payload)
    return 'local'
  }
  return 'remote'
}

function App() {
  const [groups, setGroups] = useState([])
  const [adminData, setAdminData] = useState(DEFAULT_ADMIN)
  const [activeGroupId, setActiveGroupId] = useState(null)
  const [activePersonId, setActivePersonId] = useState(null)
  const [activeCategory, setActiveCategory] = useState(null)
  const [newGroupName, setNewGroupName] = useState('')
  const [newPersonName, setNewPersonName] = useState('')
  const [groupNameDrafts, setGroupNameDrafts] = useState({})
  const [personNameDrafts, setPersonNameDrafts] = useState({})
  const [groupPasswordDrafts, setGroupPasswordDrafts] = useState({})
  const [isGroupSettingsOpen, setIsGroupSettingsOpen] = useState(false)
  const [isAdminAuthOpen, setIsAdminAuthOpen] = useState(false)
  const [adminAuthTarget, setAdminAuthTarget] = useState('group')
  const [adminCodeInput, setAdminCodeInput] = useState('')
  const [adminCodeError, setAdminCodeError] = useState('')
  const [adminCurrentCodeInput, setAdminCurrentCodeInput] = useState('')
  const [adminNewCodeInput, setAdminNewCodeInput] = useState('')
  const [adminCodeChangeError, setAdminCodeChangeError] = useState('')
  const [adminNotice, setAdminNotice] = useState('')
  const [groupAccessModal, setGroupAccessModal] = useState({ isOpen: false, groupId: null, password: '', error: '' })
  const [groupAuthAttempts, setGroupAuthAttempts] = useState({})
  const [, setAuthTick] = useState(0)
  const [nowTs, setNowTs] = useState(() => Date.now())
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [selectedPeriod, setSelectedPeriod] = useState('month')
  const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth() + 1).padStart(2, '0'))
  const [isLoaded, setIsLoaded] = useState(false)
  const [storageMode, setStorageMode] = useState(HAS_SUPABASE_CONFIG ? 'remote' : 'local')
  const [, setSaveStatus] = useState('')
  const holdTimerRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    async function initializeData() {
      const result = await loadDataFromServerOrLocal()
      if (cancelled) return
      setGroups(result.payload.groups)
      setAdminData(result.payload.admin)
      setStorageMode(result.storageMode)
      setIsLoaded(true)
    }
    initializeData()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!isLoaded) return
    const timeoutId = setTimeout(async () => {
      setSaveStatus('Сохраняем...')
      const mode = await saveDataToServer({ groups, admin: adminData })
      setStorageMode(mode)
      setSaveStatus(mode === 'remote' ? 'Сохранено' : 'Ошибка сети: данные сохранены локально')
    }, 350)
    return () => clearTimeout(timeoutId)
  }, [groups, adminData, isLoaded])

  useEffect(() => {
    if (!groupAccessModal.isOpen) return
    const id = setInterval(() => {
      setAuthTick((prev) => prev + 1)
      setNowTs(Date.now())
    }, 1000)
    return () => clearInterval(id)
  }, [groupAccessModal.isOpen])

  const activeGroup = useMemo(() => groups.find((group) => group.id === activeGroupId) ?? null, [groups, activeGroupId])
  const activePeople = useMemo(() => activeGroup?.people ?? [], [activeGroup])
  const activePerson = useMemo(() => activePeople.find((person) => person.id === activePersonId) ?? null, [activePeople, activePersonId])
  const categoryGoals = activePerson && activeCategory
    ? selectedPeriod === 'year'
      ? activePerson.categories[activeCategory]?.year ?? []
      : activePerson.categories[activeCategory]?.months ?? []
    : []
  const authBlockedRemainingSec = useMemo(() => {
    const group = groups.find((item) => item.id === groupAccessModal.groupId)
    if (!group) return 0
    const blockedUntil = groupAuthAttempts[group.id]?.blockedUntil ?? 0
    if (blockedUntil <= nowTs) return 0
    return Math.ceil((blockedUntil - nowTs) / 1000)
  }, [groupAccessModal.groupId, groupAuthAttempts, groups, nowTs])

  if (!isLoaded) {
    return <main className="app"><section><h1>Загрузка...</h1></section></main>
  }

  function openSettingsByAdmin() {
    setAdminAuthTarget('group')
    setAdminCodeError('')
    setAdminCodeInput('')
    setAdminNotice('')
    setIsAdminAuthOpen(true)
  }

  function openPeopleSettingsByAdmin() {
    setAdminAuthTarget('people')
    setAdminCodeError('')
    setAdminCodeInput('')
    setAdminNotice('')
    setIsAdminAuthOpen(true)
  }

  function startHeaderLongPress() {
    clearTimeout(holdTimerRef.current)
    holdTimerRef.current = setTimeout(() => openSettingsByAdmin(), LONG_PRESS_MS)
  }

  function stopHeaderLongPress() {
    clearTimeout(holdTimerRef.current)
  }

  async function submitAdminCodeWord() {
    const trimmed = adminCodeInput.trim()
    if (!trimmed) {
      setAdminCodeError('Введите кодовое слово.')
      return
    }
    if (!adminData.codeWordHash) {
      const codeWordHash = await hashText(trimmed)
      setAdminData({ codeWordHash, codeWordVersion: adminData.codeWordVersion })
      setIsAdminAuthOpen(false)
      if (adminAuthTarget === 'people') {
        setIsSettingsOpen(true)
      } else {
        setIsGroupSettingsOpen(true)
      }
      return
    }
    const hash = await hashText(trimmed)
    if (hash !== adminData.codeWordHash) {
      setAdminCodeError('Неверное кодовое слово.')
      return
    }
    setIsAdminAuthOpen(false)
    if (adminAuthTarget === 'people') {
      setIsSettingsOpen(true)
    } else {
      setIsGroupSettingsOpen(true)
    }
  }

  function requestEnterGroup(group) {
    if (!group.passwordHash) {
      setActiveGroupId(group.id)
      return
    }
    setGroupAccessModal({ isOpen: true, groupId: group.id, password: '', error: '' })
  }

  async function submitGroupPassword() {
    const group = groups.find((item) => item.id === groupAccessModal.groupId)
    if (!group) {
      setGroupAccessModal({ isOpen: false, groupId: null, password: '', error: '' })
      return
    }
    const attempt = groupAuthAttempts[group.id]
    const blockedUntil = attempt?.blockedUntil ?? 0
    if (blockedUntil > Date.now()) {
      const remainingSec = Math.ceil((blockedUntil - Date.now()) / 1000)
      setGroupAccessModal((prev) => ({
        ...prev,
        error: `Слишком много попыток. Повторите через ${remainingSec} сек.`,
      }))
      return
    }
    const hash = await hashText(groupAccessModal.password)
    if (hash !== group.passwordHash) {
      const nextCount = (attempt?.count ?? 0) + 1
      const nextBlockedUntil =
        nextCount >= MAX_GROUP_AUTH_ATTEMPTS ? Date.now() + GROUP_AUTH_BLOCK_MS : 0
      setGroupAuthAttempts((prev) => ({
        ...prev,
        [group.id]: { count: nextCount, blockedUntil: nextBlockedUntil },
      }))
      if (nextBlockedUntil > 0) {
        const remainingSec = Math.ceil((nextBlockedUntil - Date.now()) / 1000)
        setGroupAccessModal((prev) => ({
          ...prev,
          error: `Слишком много попыток. Повторите через ${remainingSec} сек.`,
        }))
      } else {
        setGroupAccessModal((prev) => ({ ...prev, error: 'Неверный пароль.' }))
      }
      return
    }
    setGroupAuthAttempts((prev) => ({
      ...prev,
      [group.id]: { count: 0, blockedUntil: 0 },
    }))
    setGroupAccessModal({ isOpen: false, groupId: null, password: '', error: '' })
    setActiveGroupId(group.id)
  }

  function exportBackup() {
    const payload = { groups, admin: adminData }
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    const today = new Date().toISOString().slice(0, 10)
    link.href = url
    link.download = `backup-${today}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  function addGroup() {
    const trimmedName = newGroupName.trim()
    if (!trimmedName) return
    setGroups((prev) => [...prev, { id: crypto.randomUUID(), name: trimmedName, people: [], passwordHash: null }])
    setNewGroupName('')
  }

  function deleteGroup(groupId) {
    setGroups((prev) => prev.filter((group) => group.id !== groupId))
    if (activeGroupId === groupId) {
      setActiveGroupId(null)
      setActivePersonId(null)
      setActiveCategory(null)
      setIsSettingsOpen(false)
    }
  }

  function confirmDeleteGroup(group) {
    if (window.confirm(`Удалить группу "${group.name}"?`)) deleteGroup(group.id)
  }

  function updateGroupPasswordDraft(groupId, value) {
    setGroupPasswordDrafts((prev) => ({ ...prev, [groupId]: value }))
  }

  function updateGroupNameDraft(groupId, value) {
    setGroupNameDrafts((prev) => ({ ...prev, [groupId]: value }))
  }

  function applyGroupName(group) {
    const nextName = (groupNameDrafts[group.id] ?? group.name).trim()
    if (!nextName) return
    setGroups((prev) => prev.map((item) => (item.id === group.id ? { ...item, name: nextName } : item)))
  }

  async function applyGroupPassword(group) {
    const draft = (groupPasswordDrafts[group.id] ?? '').trim()
    if (!draft) return
    const passwordHash = await hashText(draft)
    setGroups((prev) => prev.map((item) => (item.id === group.id ? { ...item, passwordHash } : item)))
    setGroupPasswordDrafts((prev) => ({ ...prev, [group.id]: '' }))
  }

  function clearGroupPassword(group) {
    setGroups((prev) => prev.map((item) => (item.id === group.id ? { ...item, passwordHash: null } : item)))
    setGroupPasswordDrafts((prev) => ({ ...prev, [group.id]: '' }))
  }

  async function changeAdminCodeWord() {
    const newCode = adminNewCodeInput.trim()
    if (!newCode) {
      setAdminCodeChangeError('Введите новое кодовое слово.')
      return
    }
    if (adminData.codeWordHash) {
      const current = adminCurrentCodeInput.trim()
      if (!current) {
        setAdminCodeChangeError('Введите текущее кодовое слово.')
        return
      }
      const currentHash = await hashText(current)
      if (currentHash !== adminData.codeWordHash) {
        setAdminCodeChangeError('Текущее кодовое слово неверное.')
        return
      }
    }
    const nextHash = await hashText(newCode)
    const nextVersion = adminData.codeWordVersion + 1
    setAdminData({ codeWordHash: nextHash, codeWordVersion: nextVersion })
    setAdminCurrentCodeInput('')
    setAdminNewCodeInput('')
    setAdminCodeChangeError('')
    setIsGroupSettingsOpen(false)
    setAdminNotice('Кодовое слово изменено. Для доступа к настройкам войдите снова.')
  }

  function addPerson() {
    if (!activeGroupId) return
    const trimmedName = newPersonName.trim()
    if (!trimmedName) return
    const newPerson = { id: crypto.randomUUID(), name: trimmedName, categories: createEmptyCategories() }
    setGroups((prev) => prev.map((group) => (group.id === activeGroupId ? { ...group, people: [...group.people, newPerson] } : group)))
    setNewPersonName('')
  }

  function deletePerson(personId) {
    if (!activeGroupId) return
    setGroups((prev) => prev.map((group) => (group.id === activeGroupId ? { ...group, people: group.people.filter((person) => person.id !== personId) } : group)))
    if (activePersonId === personId) {
      setActivePersonId(null)
      setActiveCategory(null)
    }
  }

  function updatePersonNameDraft(personId, value) {
    setPersonNameDrafts((prev) => ({ ...prev, [personId]: value }))
  }

  function applyPersonName(person) {
    if (!activeGroupId) return
    const nextName = (personNameDrafts[person.id] ?? person.name).trim()
    if (!nextName) return
    setGroups((prev) =>
      prev.map((group) => {
        if (group.id !== activeGroupId) return group
        return {
          ...group,
          people: group.people.map((item) => (item.id === person.id ? { ...item, name: nextName } : item)),
        }
      }),
    )
  }

  function updateGoal(personId, category, goalId, field, value, period) {
    if (!activeGroupId) return
    const periodKey = period === 'year' ? 'year' : 'months'
    setGroups((prev) => prev.map((group) => {
      if (group.id !== activeGroupId) return group
      return {
        ...group,
        people: group.people.map((person) => {
          if (person.id !== personId) return person
          return {
            ...person,
            categories: {
              ...person.categories,
              [category]: {
                ...person.categories[category],
                [periodKey]: person.categories[category][periodKey].map((goal) => (goal.id === goalId ? { ...goal, [field]: value } : goal)),
              },
            },
          }
        }),
      }
    }))
  }

  function addEmptyGoal(personId, category, period) {
    if (!activeGroupId) return
    const periodKey = period === 'year' ? 'year' : 'months'
    setGroups((prev) => prev.map((group) => {
      if (group.id !== activeGroupId) return group
      return {
        ...group,
        people: group.people.map((person) => {
          if (person.id !== personId) return person
          return {
            ...person,
            categories: {
              ...person.categories,
              [category]: {
                ...person.categories[category],
                [periodKey]: [...person.categories[category][periodKey], createEmptyGoal()],
              },
            },
          }
        }),
      }
    }))
  }

  function deleteGoal(personId, category, goalId, period) {
    if (!activeGroupId) return
    const periodKey = period === 'year' ? 'year' : 'months'
    setGroups((prev) => prev.map((group) => {
      if (group.id !== activeGroupId) return group
      return {
        ...group,
        people: group.people.map((person) => {
          if (person.id !== personId) return person
          return {
            ...person,
            categories: {
              ...person.categories,
              [category]: {
                ...person.categories[category],
                [periodKey]: person.categories[category][periodKey].filter((goal) => goal.id !== goalId),
              },
            },
          }
        }),
      }
    }))
  }

  return (
    <main className="app">
      {!activeGroup && (
        <section>
          <h1 onPointerDown={startHeaderLongPress} onPointerUp={stopHeaderLongPress} onPointerLeave={stopHeaderLongPress} onPointerCancel={stopHeaderLongPress}>Группы</h1>
          <div
            className="network-status"
            title={storageMode === 'remote' ? 'Сеть в норме' : 'Ошибка сети / локальный режим'}
            aria-label={storageMode === 'remote' ? 'Сеть в норме' : 'Ошибка сети'}
          >
            <span className={storageMode === 'remote' ? 'network-dot online' : 'network-dot offline'} />
          </div>
          <div className="list">
            {groups.map((group) => (
              <button type="button" className="list-item" key={group.id} onClick={() => requestEnterGroup(group)}>{group.name}</button>
            ))}
          </div>
          <button type="button" className="settings-toggle-btn" onClick={openSettingsByAdmin}>Настройки</button>
          {adminNotice && <p className="auth-success-text">{adminNotice}</p>}

          {groupAccessModal.isOpen && (
            <div className="settings-modal-overlay" onClick={() => setGroupAccessModal({ isOpen: false, groupId: null, password: '', error: '' })} role="presentation">
              <div className="settings-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Вход в группу">
                <div className="settings-modal-head">
                  <h2>Введите пароль группы</h2>
                  <button type="button" className="settings-close-btn" onClick={() => setGroupAccessModal({ isOpen: false, groupId: null, password: '', error: '' })}>Закрыть</button>
                </div>
                <div className="settings-panel">
                  <input type="password" value={groupAccessModal.password} onChange={(event) => setGroupAccessModal((prev) => ({ ...prev, password: event.target.value, error: '' }))} placeholder="Пароль группы" />
                  {groupAccessModal.error && <p className="auth-error-text">{groupAccessModal.error}</p>}
                  {authBlockedRemainingSec > 0 && (
                    <p className="auth-error-text">Повторите через {authBlockedRemainingSec} сек.</p>
                  )}
                  <button type="button" className="settings-toggle-btn" onClick={submitGroupPassword} disabled={authBlockedRemainingSec > 0}>Войти</button>
                </div>
              </div>
            </div>
          )}

          {isAdminAuthOpen && (
            <div className="settings-modal-overlay" onClick={() => setIsAdminAuthOpen(false)} role="presentation">
              <div className="settings-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Проверка администратора">
                <div className="settings-modal-head">
                  <h2>{adminData.codeWordHash ? 'Кодовое слово администратора' : 'Создайте кодовое слово'}</h2>
                  <button type="button" className="settings-close-btn" onClick={() => setIsAdminAuthOpen(false)}>Закрыть</button>
                </div>
                <div className="settings-panel">
                  <input type="password" value={adminCodeInput} onChange={(event) => { setAdminCodeInput(event.target.value); setAdminCodeError('') }} placeholder="Кодовое слово" />
                  {adminCodeError && <p className="auth-error-text">{adminCodeError}</p>}
                  <button type="button" className="settings-toggle-btn" onClick={submitAdminCodeWord}>Подтвердить</button>
                </div>
              </div>
            </div>
          )}

          {isGroupSettingsOpen && (
            <div className="settings-modal-overlay" onClick={() => setIsGroupSettingsOpen(false)} role="presentation">
              <div className="settings-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Настройки групп">
                <div className="settings-modal-head">
                  <h2>Настройки групп</h2>
                  <button type="button" className="settings-close-btn" onClick={() => setIsGroupSettingsOpen(false)}>Закрыть</button>
                </div>
                <div className="settings-panel">
                  <div className="add-group">
                    <input value={newGroupName} onChange={(event) => setNewGroupName(event.target.value)} placeholder="Название группы" />
                    <button type="button" onClick={addGroup}>+ добавить группу</button>
                    <button type="button" onClick={exportBackup}>Экспорт данных (.json)</button>
                  </div>
                  <div className="settings-delete-list">
                    {groups.map((group) => (
                      <div className="group-security-row" key={group.id}>
                        <p className="group-security-title">{group.name}</p>
                        <input
                          value={groupNameDrafts[group.id] ?? group.name}
                          onChange={(event) => updateGroupNameDraft(group.id, event.target.value)}
                          placeholder="Название группы"
                        />
                        <button type="button" className="settings-close-btn" onClick={() => applyGroupName(group)}>
                          Сохранить название
                        </button>
                        <input type="password" value={groupPasswordDrafts[group.id] ?? ''} onChange={(event) => updateGroupPasswordDraft(group.id, event.target.value)} placeholder={group.passwordHash ? 'Новый пароль группы' : 'Установить пароль группы'} />
                        <div className="group-security-actions">
                          <button type="button" className="settings-close-btn" onClick={() => applyGroupPassword(group)}>Сохранить пароль</button>
                          <button type="button" className="settings-close-btn" onClick={() => clearGroupPassword(group)}>Убрать пароль</button>
                          <button type="button" className="delete-btn" onClick={() => confirmDeleteGroup(group)}>Удалить группу</button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="settings-divider" />
                  <h3 className="security-title">Кодовое слово администратора</h3>
                  {adminCodeChangeError && <p className="auth-error-text">{adminCodeChangeError}</p>}
                  <div className="add-group">
                    {adminData.codeWordHash && <input type="password" value={adminCurrentCodeInput} onChange={(event) => setAdminCurrentCodeInput(event.target.value)} placeholder="Текущее кодовое слово" />}
                    <input type="password" value={adminNewCodeInput} onChange={(event) => setAdminNewCodeInput(event.target.value)} placeholder="Новое кодовое слово" />
                    <button type="button" onClick={changeAdminCodeWord}>Изменить кодовое слово</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {activeGroup && !activePerson && (
        <section>
          <button type="button" className="back-btn" onClick={() => { setActiveGroupId(null); setIsSettingsOpen(false) }}>Назад</button>
          <h1>{activeGroup.name}</h1>
          <div className="list">
            {activePeople.map((person) => (
              <button className="list-item" key={person.id} type="button" onClick={() => setActivePersonId(person.id)}>{person.name}</button>
            ))}
          </div>
          <button type="button" className="settings-toggle-btn" onClick={openPeopleSettingsByAdmin}>Настройки</button>
          {isSettingsOpen && (
            <div className="settings-modal-overlay" onClick={() => setIsSettingsOpen(false)} role="presentation">
              <div className="settings-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Настройки">
                <div className="settings-modal-head">
                  <h2>Настройки</h2>
                  <button type="button" className="settings-close-btn" onClick={() => setIsSettingsOpen(false)}>Закрыть</button>
                </div>
                <div className="settings-panel">
                  <div className="add-person">
                    <input value={newPersonName} onChange={(event) => setNewPersonName(event.target.value)} placeholder="Имя человека" />
                    <button type="button" onClick={addPerson}>+ добавить человека</button>
                  </div>
                  <div className="settings-delete-list">
                    {activePeople.map((person) => (
                      <div className="group-security-row" key={person.id}>
                        <p className="group-security-title">{person.name}</p>
                        <input
                          value={personNameDrafts[person.id] ?? person.name}
                          onChange={(event) => updatePersonNameDraft(person.id, event.target.value)}
                          placeholder="Имя человека"
                        />
                        <button type="button" className="settings-close-btn" onClick={() => applyPersonName(person)}>
                          Сохранить имя
                        </button>
                        <button type="button" className="delete-btn" onClick={() => deletePerson(person.id)}>
                          Удалить: {person.name}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
          {isAdminAuthOpen && (
            <div className="settings-modal-overlay" onClick={() => setIsAdminAuthOpen(false)} role="presentation">
              <div className="settings-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Проверка администратора">
                <div className="settings-modal-head">
                  <h2>{adminData.codeWordHash ? 'Кодовое слово администратора' : 'Создайте кодовое слово'}</h2>
                  <button type="button" className="settings-close-btn" onClick={() => setIsAdminAuthOpen(false)}>Закрыть</button>
                </div>
                <div className="settings-panel">
                  <input type="password" value={adminCodeInput} onChange={(event) => { setAdminCodeInput(event.target.value); setAdminCodeError('') }} placeholder="Кодовое слово" />
                  {adminCodeError && <p className="auth-error-text">{adminCodeError}</p>}
                  <button type="button" className="settings-toggle-btn" onClick={submitAdminCodeWord}>Подтвердить</button>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {activeGroup && activePerson && !activeCategory && (
        <section>
          <button type="button" className="back-btn" onClick={() => setActivePersonId(null)}>Назад</button>
          <h1>{activePerson.name}</h1>
          <div className="list">
            {CATEGORIES.map((category) => {
              const categoryData = activePerson.categories[category] ?? {}
              const goals = selectedPeriod === 'year' ? categoryData.year ?? [] : categoryData.months ?? []
              const progress = selectedPeriod === 'year' ? getCategoryProgressByYear(goals) : getCategoryProgressByMonth(goals, selectedMonth)
              return (
                <button key={category} className="category-progress-card" type="button" onClick={() => setActiveCategory(category)}>
                  <div className="category-progress-head"><span>{category}</span><strong>{progress.percent}%</strong></div>
                  <div className="progress-track"><div className="progress-fill" style={{ width: `${progress.percent}%` }} /></div>
                  <small className="progress-meta">
                    {progress.total === 0
                      ? selectedPeriod === 'year' ? 'Нет задач на год' : 'Нет задач на выбранный месяц'
                      : selectedPeriod === 'year'
                        ? `Выполнено ${progress.completed} из ${progress.total} задач за год`
                        : `Выполнено ${progress.completed} из ${progress.total} задач`}
                  </small>
                </button>
              )
            })}
          </div>
          <div className="months-panel">
            <p className="months-title">{selectedPeriod === 'year' ? 'Годовой прогресс' : 'Месяц прогресса'}</p>
            <div className="months-list">
              <button type="button" className={selectedPeriod === 'year' ? 'month-chip active' : 'month-chip'} onClick={() => setSelectedPeriod('year')}>Год</button>
              {MONTHS.map((month) => (
                <button key={month.value} type="button" className={selectedPeriod === 'month' && month.value === selectedMonth ? 'month-chip active' : 'month-chip'} onClick={() => { setSelectedPeriod('month'); setSelectedMonth(month.value) }}>{month.label}</button>
              ))}
            </div>
          </div>
        </section>
      )}

      {activeGroup && activePerson && activeCategory && (
        <section>
          <button type="button" className="back-btn" onClick={() => setActiveCategory(null)}>Назад</button>
          <h1>{activeCategory}</h1>
          <div className="goal-list">
            {categoryGoals.map((goal) => (
              <article className="goal-card" key={goal.id}>
                <label>Цель<textarea value={goal.goal} onChange={(event) => updateGoal(activePerson.id, activeCategory, goal.id, 'goal', event.target.value, selectedPeriod)} /></label>
                <label>До какого числа<input type="date" value={goal.dueDate} onChange={(event) => updateGoal(activePerson.id, activeCategory, goal.id, 'dueDate', event.target.value, selectedPeriod)} /></label>
                <label>Успешные действия<textarea value={goal.successActions} onChange={(event) => updateGoal(activePerson.id, activeCategory, goal.id, 'successActions', event.target.value, selectedPeriod)} /></label>
                <label>Неуспешные действия<textarea value={goal.failActions} onChange={(event) => updateGoal(activePerson.id, activeCategory, goal.id, 'failActions', event.target.value, selectedPeriod)} /></label>
                <label className="checkbox-row"><input type="checkbox" checked={goal.isDone} onChange={(event) => updateGoal(activePerson.id, activeCategory, goal.id, 'isDone', event.target.checked, selectedPeriod)} />Выполнено</label>
                {isGoalEmpty(goal) && <button type="button" className="delete-goal-btn" onClick={() => deleteGoal(activePerson.id, activeCategory, goal.id, selectedPeriod)}>Удалить пустую цель</button>}
              </article>
            ))}
          </div>
          <button type="button" className="secondary-btn" onClick={() => addEmptyGoal(activePerson.id, activeCategory, selectedPeriod)}>+ добавить пустую цель</button>
          <button
            type="button"
            className="save-btn"
            onClick={async () => {
              setSaveStatus('Сохраняем...')
              const mode = await saveDataToServer({ groups, admin: adminData })
              setStorageMode(mode)
              setSaveStatus(mode === 'remote' ? 'Сохранено' : 'Ошибка сети: данные сохранены локально')
            }}
          >
            Сохранить
          </button>
        </section>
      )}
    </main>
  )
}

export default App
