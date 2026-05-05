import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import './App.css'

const STORAGE_KEY = 'discipline-control-system-data'
const REMOTE_STATE_ROW_ID = 'main'

const CATEGORIES = [
  'Финансы',
  'Бизнес',
  'Здоровье',
  'Семья',
  'Окружение',
  'Яркость жизни',
]

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
const supabase = HAS_SUPABASE_CONFIG
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null

function createGoal(goal, dueDate, successActions, failActions, isDone = false) {
  return {
    id: crypto.randomUUID(),
    goal,
    dueDate,
    successActions,
    failActions,
    isDone,
  }
}

function createEmptyGoal() {
  return createGoal('', '', '', '', false)
}

function isGoalEmpty(goal) {
  const goalText = goal.goal ?? ''
  const dueDate = goal.dueDate ?? ''
  const successActions = goal.successActions ?? ''
  const failActions = goal.failActions ?? ''

  return (
    goalText.trim() === '' &&
    dueDate.trim() === '' &&
    successActions.trim() === '' &&
    failActions.trim() === '' &&
    goal.isDone === false
  )
}

function getCategoryProgressByMonth(goals, month) {
  const monthlyGoals = goals.filter((goal) => {
    if (isGoalEmpty(goal)) {
      return false
    }
    const monthFromDate = (goal.dueDate ?? '').slice(5, 7)
    return monthFromDate === month
  })

  const total = monthlyGoals.length
  const completed = monthlyGoals.filter((goal) => goal.isDone).length
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100)

  return { total, completed, percent }
}

function createInitialPeopleData() {
  return [
    {
      id: crypto.randomUUID(),
      name: 'Алексей',
      categories: {
        Финансы: [
          createGoal('Сформировать подушку 100 000', '2026-08-01', 'Откладываю 5 000 в неделю', 'Покупаю лишнее', false),
          createGoal('Закрыть кредитную карту', '2026-09-15', 'Вношу двойной платеж', 'Пропускаю платеж', false),
        ],
        Бизнес: [createGoal('Запустить лендинг услуги', '2026-06-20', 'Пишу по 1 блоку в день', 'Отвлекаюсь на мелкие задачи', false)],
        Здоровье: [createGoal('Тренировки 3 раза в неделю', '2026-07-01', 'Планирую тренировки заранее', 'Пропускаю вечерние занятия', false)],
        Семья: [createGoal('1 семейный вечер в неделю', '2026-06-30', 'Ставлю в календарь', 'Работаю допоздна', false)],
        Окружение: [createGoal('1 полезный нетворкинг-звонок в неделю', '2026-07-15', 'Пишу 3 контактам в понедельник', 'Откладываю звонки', false)],
        'Яркость жизни': [createGoal('2 новых впечатления в месяц', '2026-08-31', 'Планирую активности на выходные', 'Сижу дома по привычке', false)],
      },
    },
    {
      id: crypto.randomUUID(),
      name: 'Марина',
      categories: {
        Финансы: [createGoal('Вести учет расходов ежедневно', '2026-06-10', 'Записываю траты вечером', 'Пропускаю выходные', false)],
        Бизнес: [createGoal('Найти 2 новых клиента', '2026-07-20', 'Делаю 5 касаний в день', 'Не веду CRM', false)],
        Здоровье: [
          createGoal('Сон не меньше 7 часов', '2026-06-25', 'Ложусь до 23:00', 'Листаю телефон ночью', false),
          createGoal('10 000 шагов каждый день', '2026-07-10', 'Гуляю после обеда', 'Сижу весь день', false),
        ],
        Семья: [createGoal('Созвон с родителями 2 раза в неделю', '2026-06-30', 'Фиксирую дни звонков', 'Переношу на потом', false)],
        Окружение: [createGoal('Сократить общение с токсичными людьми', '2026-07-31', 'Ставлю границы в диалоге', 'Соглашаюсь на все', false)],
        'Яркость жизни': [createGoal('1 поездка в новое место в месяц', '2026-08-31', 'Бронирую заранее', 'Откладываю решение', false)],
      },
    },
    {
      id: crypto.randomUUID(),
      name: 'Игорь',
      categories: {
        Финансы: [createGoal('Увеличить доход на 20%', '2026-09-01', 'Развиваю доп. направление', 'Не считаю результаты', false)],
        Бизнес: [createGoal('Собрать базу из 100 лидов', '2026-07-30', 'Добавляю 5 лидов ежедневно', 'Нет системности', false)],
        Здоровье: [createGoal('Сдать чек-ап', '2026-06-15', 'Записался к врачам', 'Откладываю запись', false)],
        Семья: [createGoal('Проводить выходной без работы', '2026-06-28', 'Отключаю уведомления', 'Проверяю чаты по привычке', false)],
        Окружение: [createGoal('Посетить 2 проф. мероприятия', '2026-08-20', 'Ищу события заранее', 'Не регистрируюсь вовремя', false)],
        'Яркость жизни': [
          createGoal('Выделять время на хобби 3 раза в неделю', '2026-07-15', 'Ставлю слоты в расписание', 'Занимаю время работой', false),
          createGoal('Сходить на концерт', '2026-06-30', 'Покупаю билет заранее', 'Жду до последнего', false),
        ],
      },
    },
  ]
}

function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY)

  if (!raw) {
    return createInitialPeopleData()
  }

  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return parsed
    }
  } catch (error) {
    console.error('Не удалось прочитать данные:', error)
  }

  return createInitialPeopleData()
}

function saveDataToLocalStorage(people) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(people))
}

async function loadDataFromServerOrLocal() {
  if (!supabase) {
    return { people: loadData(), storageMode: 'local' }
  }

  const { data, error } = await supabase
    .from('people_data')
    .select('data')
    .eq('id', REMOTE_STATE_ROW_ID)
    .maybeSingle()

  if (error) {
    console.error('Ошибка чтения из Supabase, включен localStorage fallback:', error.message)
    return { people: loadData(), storageMode: 'local' }
  }

  if (Array.isArray(data?.data)) {
    return { people: data.data, storageMode: 'remote' }
  }

  const initialData = loadData()
  return { people: initialData, storageMode: 'remote' }
}

async function saveDataToServer(people) {
  if (!supabase) {
    saveDataToLocalStorage(people)
    return 'local'
  }

  const { error } = await supabase.from('people_data').upsert(
    {
      id: REMOTE_STATE_ROW_ID,
      data: people,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  )

  if (error) {
    console.error('Ошибка сохранения в Supabase, записано только в localStorage:', error.message)
    saveDataToLocalStorage(people)
    return 'local'
  }

  return 'remote'
}

function App() {
  const [people, setPeople] = useState([])
  const [activePersonId, setActivePersonId] = useState(null)
  const [activeCategory, setActiveCategory] = useState(null)
  const [newPersonName, setNewPersonName] = useState('')
  const [selectedMonth, setSelectedMonth] = useState(
    String(new Date().getMonth() + 1).padStart(2, '0'),
  )
  const [isLoaded, setIsLoaded] = useState(false)
  const [storageMode, setStorageMode] = useState(HAS_SUPABASE_CONFIG ? 'remote' : 'local')

  useEffect(() => {
    let cancelled = false

    async function initializeData() {
      const result = await loadDataFromServerOrLocal()
      if (cancelled) {
        return
      }
      setPeople(result.people)
      setStorageMode(result.storageMode)
      setIsLoaded(true)
    }

    initializeData()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!isLoaded) {
      return
    }

    const timeoutId = setTimeout(async () => {
      const mode = await saveDataToServer(people)
      setStorageMode(mode)
    }, 350)

    return () => clearTimeout(timeoutId)
  }, [people, isLoaded])

  const activePerson = useMemo(
    () => people.find((person) => person.id === activePersonId) ?? null,
    [people, activePersonId],
  )

  const categoryGoals = activePerson && activeCategory
    ? activePerson.categories[activeCategory] ?? []
    : []

  if (!isLoaded) {
    return (
      <main className="app">
        <section>
          <h1>Загрузка...</h1>
        </section>
      </main>
    )
  }

  function addPerson() {
    const trimmedName = newPersonName.trim()
    if (!trimmedName) {
      return
    }

    const categories = CATEGORIES.reduce((acc, category) => {
      acc[category] = [createEmptyGoal()]
      return acc
    }, {})

    setPeople((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name: trimmedName,
        categories,
      },
    ])
    setNewPersonName('')
  }

  function deletePerson(personId) {
    setPeople((prev) => prev.filter((person) => person.id !== personId))

    if (activePersonId === personId) {
      setActivePersonId(null)
      setActiveCategory(null)
    }
  }

  function updateGoal(personId, category, goalId, field, value) {
    setPeople((prev) =>
      prev.map((person) => {
        if (person.id !== personId) {
          return person
        }

        return {
          ...person,
          categories: {
            ...person.categories,
            [category]: person.categories[category].map((goal) =>
              goal.id === goalId ? { ...goal, [field]: value } : goal,
            ),
          },
        }
      }),
    )
  }

  function addEmptyGoal(personId, category) {
    setPeople((prev) =>
      prev.map((person) => {
        if (person.id !== personId) {
          return person
        }

        return {
          ...person,
          categories: {
            ...person.categories,
            [category]: [...person.categories[category], createEmptyGoal()],
          },
        }
      }),
    )
  }

  function deleteGoal(personId, category, goalId) {
    setPeople((prev) =>
      prev.map((person) => {
        if (person.id !== personId) {
          return person
        }

        return {
          ...person,
          categories: {
            ...person.categories,
            [category]: person.categories[category].filter((goal) => goal.id !== goalId),
          },
        }
      }),
    )
  }

  return (
    <main className="app">
      {!activePerson && (
        <section>
          <h1>Группа</h1>
          <p className="storage-badge">
            {storageMode === 'remote'
              ? 'Общее хранилище: Supabase'
              : 'Локальный режим: localStorage'}
          </p>

          <div className="list">
            {people.map((person) => (
              <div className="person-row" key={person.id}>
                <button
                  className="list-item"
                  type="button"
                  onClick={() => setActivePersonId(person.id)}
                >
                  {person.name}
                </button>
                <button
                  type="button"
                  className="delete-btn"
                  onClick={() => deletePerson(person.id)}
                >
                  Удалить
                </button>
              </div>
            ))}
          </div>

          <div className="add-person">
            <input
              value={newPersonName}
              onChange={(event) => setNewPersonName(event.target.value)}
              placeholder="Имя человека"
            />
            <button type="button" onClick={addPerson}>
              + добавить человека
            </button>
          </div>
        </section>
      )}

      {activePerson && !activeCategory && (
        <section>
          <button type="button" className="back-btn" onClick={() => setActivePersonId(null)}>
            Назад
          </button>
          <h1>{activePerson.name}</h1>

          <div className="list">
            {CATEGORIES.map((category) => {
              const goals = activePerson.categories[category] ?? []
              const progress = getCategoryProgressByMonth(goals, selectedMonth)

              return (
                <button
                  key={category}
                  className="category-progress-card"
                  type="button"
                  onClick={() => setActiveCategory(category)}
                >
                  <div className="category-progress-head">
                    <span>{category}</span>
                    <strong>{progress.percent}%</strong>
                  </div>
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${progress.percent}%` }} />
                  </div>
                  <small className="progress-meta">
                    {progress.total === 0
                      ? 'Нет задач на выбранный месяц'
                      : `Выполнено ${progress.completed} из ${progress.total} задач`}
                  </small>
                </button>
              )
            })}
          </div>

          <div className="months-panel">
            <p className="months-title">Месяц прогресса</p>
            <div className="months-list">
              {MONTHS.map((month) => (
                <button
                  key={month.value}
                  type="button"
                  className={month.value === selectedMonth ? 'month-chip active' : 'month-chip'}
                  onClick={() => setSelectedMonth(month.value)}
                >
                  {month.label}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {activePerson && activeCategory && (
        <section>
          <button type="button" className="back-btn" onClick={() => setActiveCategory(null)}>
            Назад
          </button>
          <h1>{activeCategory}</h1>

          <div className="goal-list">
            {categoryGoals.map((goal) => (
              <article className="goal-card" key={goal.id}>
                <label>
                  Цель
                  <textarea
                    value={goal.goal}
                    onChange={(event) => updateGoal(activePerson.id, activeCategory, goal.id, 'goal', event.target.value)}
                  />
                </label>

                <label>
                  До какого числа
                  <input
                    type="date"
                    value={goal.dueDate}
                    onChange={(event) => updateGoal(activePerson.id, activeCategory, goal.id, 'dueDate', event.target.value)}
                  />
                </label>

                <label>
                  Успешные действия
                  <textarea
                    value={goal.successActions}
                    onChange={(event) =>
                      updateGoal(activePerson.id, activeCategory, goal.id, 'successActions', event.target.value)
                    }
                  />
                </label>

                <label>
                  Неуспешные действия
                  <textarea
                    value={goal.failActions}
                    onChange={(event) => updateGoal(activePerson.id, activeCategory, goal.id, 'failActions', event.target.value)}
                  />
                </label>

                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={goal.isDone}
                    onChange={(event) => updateGoal(activePerson.id, activeCategory, goal.id, 'isDone', event.target.checked)}
                  />
                  Выполнено
                </label>

                {isGoalEmpty(goal) && (
                  <button
                    type="button"
                    className="delete-goal-btn"
                    onClick={() => deleteGoal(activePerson.id, activeCategory, goal.id)}
                  >
                    Удалить пустую цель
                  </button>
                )}
              </article>
            ))}
          </div>

          <button
            type="button"
            className="secondary-btn"
            onClick={() => addEmptyGoal(activePerson.id, activeCategory)}
          >
            + добавить пустую цель
          </button>

          <button
            type="button"
            className="save-btn"
            onClick={async () => {
              const mode = await saveDataToServer(people)
              setStorageMode(mode)
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
