# Commet Clone — Experimental AI-Assisted Portfolio Project

> **⚠️ Experimental Project** — This is a portfolio project developed with AI assistance to demonstrate full-stack development capabilities. Development is currently **paused**. Not production-ready.

> **No affiliation / Sem afiliação** — This project is **not affiliated with, endorsed by, or sponsored by Commet, Discord Inc., or any other company**. “Commet”, “Discord” and all other product names and trademarks belong to their respective owners. It is a study/portfolio project, not a commercial product. See [DISCLAIMER.md](DISCLAIMER.md).
>
> Este projeto **não é afiliado, endossado ou patrocinado pela Commet, Discord Inc. ou qualquer outra empresa**. Nomes e marcas pertencem aos seus respectivos titulares. É um projeto de estudo/portfólio, não um produto comercial.

---

## Objective

A Discord-style real-time chat application clone with:
- Text channels (Discord-like)
- Voice channels via WebRTC mesh P2P
- JWT authentication
- Server/channel management
- Modern responsive UI

---

## Tech Stack (Verified in Code)

| Layer | Technology | Version |
|-------|------------|---------|
| **Frontend** | Next.js (App Router) | 14.2.0 |
| | React | 18 |
| | Tailwind CSS | 3.x |
| | socket.io-client | 4.x |
| **Backend** | NestJS | 10.x |
| | @nestjs/websockets + @nestjs/platform-socket.io | 10.x |
| | Prisma ORM | 5.x |
| | SQLite (dev) / PostgreSQL (prod) | — |
| | bcrypt, passport-jwt, class-validator | — |
| **Real-time** | Socket.IO (namespace `/ws-chat`) | 4.x |
| **Voice** | WebRTC Mesh P2P (STUN: Google) | — |

---

## Implemented Features

### ✅ Authentication
- `POST /auth/register` — username, email, password → JWT
- `POST /auth/login` — username, password → JWT
- `GET /auth/me` — returns authenticated user
- Password hashing with bcrypt (cost 10)
- JWT with 7-day expiry, HS256

### ✅ Server Management (CRUD)
- Create server (`POST /servers`)
- List user's servers (`GET /servers`)
- Get server with members & channels (`GET /servers/:id`)
- Update server name — owner only (`PUT /servers/:id`)
- Delete server — owner only, cascades (`DELETE /servers/:id`)
- Join/leave server (`POST /servers/:id/join|leave`)

### ✅ Channel Management (CRUD)
- Create channel (text/voice) — `POST /servers/:serverId/channels`
- List channels — `GET /servers/:serverId/channels`
- Get channel — `GET /servers/:serverId/channels/:id`
- Update channel — owner only (`PUT`)
- Delete channel — owner only (`DELETE`)

### ✅ Messages (CRUD)
- List messages — `GET /channels/:channelId/messages`
- Create message — `POST /channels/:channelId/messages`
- Delete message — author or server owner (`DELETE`)

### ✅ Real-time (Socket.IO)
- Namespace: `/ws-chat`
- Auth via JWT in handshake (`auth: { token }`)
- Events: `join_channel`, `send_message`, `new_message` broadcast

### ✅ Voice Channels (WebRTC Mesh P2P)
- Signaling via Socket.IO: `join_voice`, `leave_voice`, `voice_offer`, `voice_answer`, `voice_ice_candidate`
- Broadcasts: `voice_user_joined`, `voice_user_left`, `voice_joined`, `voice_left`
- STUN: `stun.l.google.com:19302`, `stun1.l.google.com:19302`
- ICE candidate buffering for early candidates
- Offer deduplication (`pendingOffers` Set)
- Mute (disables local track + all RTCRtpSenders)
- Deafen (mutes remote audio elements only)
- Full cleanup on leave/disconnect

### ✅ Frontend (Next.js 14 + Tailwind)
- Discord-style layout: server list, channel list, chat/voice area
- Login/Register pages
- VoiceChannel component with mute/deafen/participant list
- WebSocketContext with Socket.IO client, reconnection logic, stale-closure fixes

### ✅ Testing
- **130 tests passing** (unit + e2e)
- Voice gateway events: 19 new tests (join, leave, offer, answer, ICE, auth, cleanup)
- Run with: `cd apps/api && npx jest --runInBand`

---

## Prerequisites

- Node.js 18+
- npm 9+
- (Optional) PostgreSQL for production — currently uses SQLite

---

## Installation & Running (Verified)

```bash
# 1. Backend
cd apps/api
npm install
npx prisma generate
npx prisma migrate dev  # creates dev.db
npm run build
node dist/main          # runs on http://localhost:4000

# 2. Frontend (separate terminal)
cd apps/web
npm install
npm run build
npm run dev             # runs on http://localhost:3000
```

**Environment** (`apps/api/.env`):
```env
DATABASE_URL="file:./dev.db"
JWT_SECRET="your-secure-secret"  # required for production
```

---

## Known Limitations & Unresolved Issues

| Area | Status | Details |
|------|--------|---------|
| **Voice P2P scaling** | ⚠️ Known limit | Mesh P2P works up to ~6 users (O(n²) bandwidth/CPU). SFU (mediasoup) needed for larger groups. |
| **TURN servers** | ❌ Not implemented | Only Google STUN. Restrictive NATs will fail. |
| **Real audio validation** | ❌ Not tested | No two-browser test environment available. Manual test guide in `PROGRESS.md`. |
| **JWT secret** | ⚠️ Dev fallback | Uses `'dev-secret-change-in-production'` if `JWT_SECRET` not set. Must override in prod. |
| **In-memory voice tracking** | ⚠️ Not persistent | Participants lost on server restart. |
| **PostgreSQL** | ❌ Not configured | Uses SQLite (`file:./dev.db`). `provider = "postgresql"` + `DATABASE_URL` needed for prod. |
| **Automatic renegotiation** | ❌ Not implemented | Device change doesn't trigger renegotiation. |
| **API process management** | ⚠️ Manual | `node dist/main` must be kept alive (no systemd/PM2 config). |

---

## Security Notes for Public Release

- **No production secrets in repo** — `.env` only contains `DATABASE_URL="file:./dev.db"` (local SQLite)
- **JWT secret** — falls back to hardcoded dev value; **must** set `JWT_SECRET` env var in production
- **Passwords** — hashed with bcrypt (cost 10), never logged
- **Local DB** — `apps/api/prisma/dev.db` ignored via `.gitignore`
- **No API keys, tokens, or credentials** found in tracked files or history

---

## Development State

**Status: PAUSED** — Last active session completed WebSocket/Socket.IO protocol fix and infinite-loop resolution.

To resume:
1. Set up PostgreSQL + `JWT_SECRET` for production
2. Implement TURN server config for voice
3. Add SFU (mediasoup) for voice scaling >6 users
4. Add automated e2e tests for voice (Playwright/Cypress)
5. Containerize with Docker / add systemd/PM2 configs

---

## Project Structure

```
commet-clone/
├── apps/
│   ├── api/                 # NestJS backend
│   │   ├── src/
│   │   │   ├── auth/        # JWT auth, bcrypt, guards
│   │   │   ├── servers/     # Server CRUD + membership
│   │   │   ├── channels/    # Channel CRUD (text/voice)
│   │   │   ├── messages/    # Message CRUD
│   │   │   ├── gateway/     # Socket.IO gateway (WS + voice)
│   │   │   └── prisma/      # Prisma service
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── dev.db       # ignored
│   │   │   └── migrations/
│   │   └── .env             # ignored
│   └── web/                 # Next.js frontend
│       ├── src/
│       │   ├── app/         # App router pages
│       │   ├── components/  # Login, Register, AppLayout, VoiceChannel
│       │   ├── context/     # AuthContext, WebSocketContext (Socket.IO)
│       │   └── lib/         # API client
│       └── .env             # ignored
├── PROGRESS.md              # Detailed development log
└── README.md                # This file
```

---

## License

MIT — Feel free to study, fork, or extend. This is a learning/portfolio project.