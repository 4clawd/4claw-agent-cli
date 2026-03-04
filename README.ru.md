<div align="center">
  <a href="./README.md"><kbd>English (Default)</kbd></a>
  <a href="./README.zh-CN.md"><kbd>简体中文</kbd></a>
  <a href="./README.ru.md"><kbd>Русский</kbd></a>
</div>

<br />

<div align="center">
  <img src="./docs/images/logo.png" alt="4claw logo" width="128" />
</div>

<div align="center">
  <img src="./docs/images/banner.png" alt="4claw desktop banner" width="100%" />
</div>

# 4claw CLI Desktop

4claw CLI Desktop — это GUI-приложение на Electron, которое превращает бинарный runtime `4claw` в удобную настольную консоль для управления несколькими агентами.

Проект сохраняет мощность CLI-подхода, но упрощает ежедневные операции: создание агентов, запуск/остановка, редактирование конфигурации, просмотр логов, резервные копии и фоновая работа через системный трей.

## Что реализовано

### 1. Управление жизненным циклом нескольких агентов

- Создание, переименование, удаление, запуск и остановка агентов
- Изолированные данные на каждого агента:
  - `config.json`
  - `workspace/`
  - `logs/runtime.log`
  - `meta.json`

### 2. Мастер создания агента

- Шаг 1: имя агента + параметры модели
  - `model alias`
  - `model name`
  - `api_base`
  - `api_key`
- Шаг 2: параметры Telegram
  - `enabled`
  - `bot token`
  - `allow_from`
- Кнопка `Create & Start` автоматически:
  - создает структуру агента
  - записывает значения в `config.json`
  - запускает gateway-процесс

### 3. Два режима редактирования конфигурации

- `Quick Config`: быстрые основные поля
- `Full Config`: полный рекурсивный JSON-редактор
- Импорт/экспорт конфигурации

### 4. Логи и резервные копии

- Обновление логов в реальном времени (пуллинг 0.5 сек)
- Очистка логов из UI
- Создание/экспорт/импорт/восстановление бэкапов
- Восстановление бэкапа в нового агента

### 5. Удобство для долгой фоновой работы

- Безрамочное окно + собственные кнопки сверху справа
- Настраиваемое поведение закрытия:
  - спрашивать каждый раз
  - сворачивать в трей
  - сразу выходить
- Трей:
  - двойной клик открывает панель
  - контекстное меню: открыть панель / выйти

### 6. Визуальная система

- Светлый стиль (неоморфизм + glassmorphism)
- Жёлто-оранжевая палитра
- Единый логотип и бренд-оформление

## Скриншоты

### Главная панель

![Main Console](./docs/images/main.png)

### Настройки и конфигурация

![Settings Panel](./docs/images/setting.png)

## Технологический стек

- Electron (main / preload / renderer)
- HTML + CSS + Vanilla JavaScript
- Node.js (файловая система и управление процессами)
- Безопасный IPC через `contextBridge` + `ipcRenderer.invoke`
- `electron-builder` для Windows/macOS

## Архитектура

### Main process (`src/main`)

- Жизненный цикл окна, трей, политика закрытия
- Запуск/остановка процессов агента
- Работа с конфигами, логами и бэкапами
- IPC-обработчики для renderer

### Preload (`src/preload`)

- Экспорт ограниченного API в renderer:
  - инициализация и настройки
  - CRUD агентов и управление процессом
  - операции с config/log/backup
  - открытие папки и управление окном

### Renderer (`src/renderer`)

- UI с вкладками:
  - Dashboard
  - Config (Quick / Full)
  - Logs
  - Backups
  - Settings
- Мастер создания и JSON-редактор
- Синхронизация состояния и автообновление логов

## Размещение бинарника

Поместите собранный бинарник 4claw в:

- `resources/bin/4claw-windows-amd64.exe` (Windows x64)
- `resources/bin/4claw-darwin-amd64` (macOS Intel)
- `resources/bin/4claw-darwin-arm64` (macOS Apple Silicon)

## Быстрый старт

1. Установите зависимости:

```bash
npm install
```

2. Положите нужный бинарник 4claw в `resources/bin/`.

3. Запустите dev-режим:

```bash
npm run dev
```

## Сборка

- Распакованный локальный бандл:

```bash
npm run pack
```

- Windows installer (NSIS):

```bash
npm run dist:win
```

- Windows portable (один exe):

```bash
npm run dist:win:portable
```

- Сразу installer + portable:

```bash
npm run dist:win:all
```

- macOS DMG:

```bash
npm run dist:mac
```

## Данные runtime и бэкапы

Корень runtime:

- `<userData>/runtime/`

Каталоги агентов:

- `<userData>/runtime/agents/<agent-id>/`

Каталог резервных копий:

- `<userData>/runtime/backups/`

Такая структура упрощает перенос между машинами, архивирование и восстановление после сбоев.

## Практическая польза

- Меньше ручных CLI-операций в повседневной работе
- Меньше ошибок в конфиге благодаря мастеру и Quick Config
- Полная гибкость через Full Config JSON-редактор
- Быстрая диагностика через почти real-time логи
- Безопасная эксплуатация через экспорт/импорт бэкапов
- Непрерывная работа агентов в фоне через трей

## License

MIT
