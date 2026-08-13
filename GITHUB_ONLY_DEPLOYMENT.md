# Skipper — режим «только GitHub»

## Что хранится в репозитории

- frontend Mini App
- Firebase Realtime Database Rules
- Firebase Storage Rules
- Cloud Functions
- официальный каталог контента
- GitHub Actions для проверки и деплоя

## Что нужно один раз вне кода

Сам GitHub не является runtime для Telegram/Firebase backend. Репозиторий уже настроен на Firebase-проект `shkiper-5650c`; для запуска нужны только существующий Firebase project, Telegram bot и три GitHub Actions secrets.

### GitHub Secrets

В `Settings → Secrets and variables → Actions` создай:

`FIREBASE_SERVICE_ACCOUNT` — JSON service-account ключ Firebase/GCP с правами на deploy.

`SKIPPER_BOT_TOKEN` — токен Telegram-бота.

`SKIPPER_OWNER_TELEGRAM_ID` — числовой Telegram ID единственного владельца.

После этого push в `main` запускает `.github/workflows/deploy.yml`.

Workflow:

1. проверяет JavaScript, JSON, импорт/экспорт модулей и frontend→backend endpoints;
2. авторизует GitHub Action в Google/Firebase;
3. обновляет Firebase Secret Manager значениями Telegram bot token и Owner ID;
4. разворачивает Hosting, Database Rules, Storage Rules и Cloud Functions.

## Telegram Mini App

URL GitHub Pages не используется как backend. Mini App должен открываться из Telegram, а `Telegram.WebApp.initData` отправляется на backend для проверки подписи.

Публичная Firebase client config находится в `firebase-config.js` специально: Firebase web config не является секретом. Секреты не попадают в репозиторий.

## Owner

Единственный Owner определяется на сервере по `SKIPPER_OWNER_TELEGRAM_ID` и фиксируется в закрытом `privateSystem/ownerUid`.

Обычная RBAC-операция не может создать второго Owner.

## После первоначальной настройки

Дальше обычный цикл:

`изменил код → commit → push main → GitHub Actions → deploy`
