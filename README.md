# Clone do Commet.chat

Projeto de um clone do Commet.chat com UI estilo Discord, backend próprio e auto-hospedagem.

## Stack
- Frontend: Next.js 14 + React + Tailwind
- Backend: NestJS + Prisma + PostgreSQL
- Mídia: WebRTC (mediasoup/SFU futuro)

## Rodar
```bash
# Backend
cd apps/api && npm install && npm run dev

# Frontend
cd apps/web && npm install && npm run dev
```

Acesse http://localhost:3000

## Estado atual
- Infraestrutura básica criada
- Servidor rodando localmente
- Endpoint POST /servers funcionando

## Próximos passos
- Autenticação JWT
- Integração com Prisma/PostgreSQL
- Layout Discord completo
- Testes unitários
