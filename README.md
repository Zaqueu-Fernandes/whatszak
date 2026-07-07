# WhatsZak

App de chat familiar (web + Android) com mensagens em tempo real, chamadas de áudio/vídeo via WebRTC e notificações push.

## Stack

- Vite + React + TypeScript + shadcn-ui + Tailwind CSS
- Supabase (Auth, Postgres, Realtime, Storage, Edge Functions)
- Firebase Cloud Messaging (push notifications)
- Capacitor (empacotamento Android)

## Rodando localmente

Requisitos: Node.js + npm ([instalar com nvm](https://github.com/nvm-sh/nvm#installing-and-updating)).

```sh
npm i
npm run dev
```

## Build web

```sh
npm run build
```

O deploy da versão web é feito no [Vercel](https://vercel.com), a partir do branch `main` deste repositório.

## Build Android (APK)

```sh
npm run build
npx cap sync android
```

Depois abra a pasta `android/` no Android Studio e gere o APK (`Build → Generate App Bundles or APKs`).

O app Android carrega o conteúdo direto de `https://whatszak.vercel.app` (ver `capacitor.config.ts` → `server.url`), então mudanças de tela/funcionalidade só precisam de um novo deploy no Vercel — não é necessário gerar um novo APK. Só é preciso rebuildar o APK quando algo nativo mudar (permissões, plugins do Capacitor, configuração do Firebase nativo, ícone, etc).

## Backend (Supabase)

Schema e migrations em `supabase/migrations/`. Para aplicar num projeto Supabase:

```sh
npx supabase login
npx supabase link --project-ref <seu-project-ref>
npx supabase db push
npx supabase functions deploy send-push
```

A Edge Function `send-push` precisa da secret `FCM_SERVICE_ACCOUNT_JSON` (chave de conta de serviço do Firebase, com permissão de Cloud Messaging).
