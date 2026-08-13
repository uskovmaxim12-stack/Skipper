# 🐧 Шкипер за штурвалом — Ecosystem 12.0

GitHub-ready source package for the Skipper aviation ecosystem.

## Что внутри
- 67 реальных официальных материалов из ICAO/EASA/EUROCONTROL в `data/official-news.json` — без выдуманных пользователей и fake-активности.
- live official sync с лимитом 80 записей и локальным официальным fallback.
- Telegram authentication через Cloud Functions + Firebase Custom Token.
- один системный Owner, зафиксированный server-side secret `SKIPPER_OWNER_TELEGRAM_ID`.
- RBAC: owner, superadmin, admin, security admin, content lead, content creator, editor, moderator lead, moderator, community manager, analyst, support, game master, user.
- realtime feed, forum, crew, messenger, notifications, games, XP и leaderboard foundation.
- серверная модерация публикаций и forum threads.
- userChats индекс для безопасной загрузки списка диалогов без чтения всего `/chats`.
- owner snapshot, account suspension/deletion, audit log и системные настройки.
- строгие Realtime Database / Storage Rules.
- GitHub Actions CI для автоматической проверки JavaScript и JSON на каждом push/PR.

## Реальные данные
Каталог не содержит demo-контента. Seed использует реальные материалы официальных newsroom-страниц. ICAO Newsroom публикует свежие новости по безопасности, регулированию, развитию и другим направлениям; EASA Newsroom содержит сотни официальных материалов и обновлений; EUROCONTROL публикует operational/ATM, network и data материалы. Проверка текущей ленты подтверждает публикации ICAO от июля 2026, EASA от июля 2026 и EUROCONTROL материалы июля–апреля 2026.

## Owner
Нельзя определить Owner из клиентского JavaScript: это сознательно вынесено из репозитория в Firebase Functions Secret:

`SKIPPER_OWNER_TELEGRAM_ID`

Также backend требует `SKIPPER_BOT_TOKEN` для проверки подписанных Telegram WebApp init data.

## Важная техническая граница
Сам GitHub может хранить и проверять исходный код, но не заменяет Firebase Functions/Auth/Realtime Database. Этот репозиторий содержит весь необходимый backend-код и конфигурацию, однако реальные Telegram login, realtime-сообщения, RBAC и серверный XP работают только после запуска Cloud Functions и Firebase Rules. Секреты намеренно не записаны в Git.

## Проверка
```bash
npm install
npm run check
```

GitHub Actions автоматически выполняет тот же `npm run check`.


## Deployment model

Репозиторий является источником кода. После единственной настройки GitHub Secrets workflow `Skipper Deploy` сам проверяет код и разворачивает Hosting, Database Rules, Storage Rules и Cloud Functions в Firebase-проект `shkiper-5650c`. Для Telegram-бота и единственного Owner секреты хранятся в GitHub Secrets и синхронизируются в Firebase Secret Manager во время деплоя.

Требуются три GitHub Secrets:

- `FIREBASE_SERVICE_ACCOUNT` — JSON сервисного аккаунта Firebase/GCP с правами на деплой.
- `SKIPPER_BOT_TOKEN` — токен Telegram-бота.
- `SKIPPER_OWNER_TELEGRAM_ID` — Telegram ID единственного Owner.

После этого обычный цикл — только commit/push в `main`.
