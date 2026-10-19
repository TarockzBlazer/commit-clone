# PROGRESS.md — Commet Clone

## Etapa atual
1. Auditoria concluída
2. Correções estruturais feitas
3. Infraestrutura básica instalada e rodando
4. **Autenticação JWT implementada** ✅
5. **CRUD de Servers completo** ✅
6. **CRUD de Channels completo** ✅ (create, list, get by id, update, delete)
7. **CRUD de Messages completo** ✅ (list, create, delete)
8. **WebSocket Gateway implementado** ✅ (real-time messages, join channel, voice signaling)
9. **Prisma + SQLite rodando** ✅
10. **Validação global com class-validator** ✅ (DTOs para servers, channels, messages)
11. **Testes unitários e de integração implementados** ✅ (130 testes passando)
12. **Frontend Next.js integrado com API** ✅ (layout, auth, servers, channels, messages, WebSocket)
13. **Voice Channels (WebRTC) implementado e validado** ✅ (join/leave, signaling, mesh P2P audio, race condition fixes, ICE buffering, mute/deafen, cleanup)

## Objetivo em andamento
Criar clone do Commet.chat com UI Discord, backend próprio, auto-hospedável, voz/tela em grupo e efeitos sonoros.

## Funcionalidades concluídas
- Estrutura monorepo criada: `/apps/web` (Next.js 14) + `/apps/api` (NestJS 10)
- Next.js 14 instalado e rodando em http://localhost:3000 (dev server)
- NestJS 10 instalado e rodando em http://localhost:4000 (produção)
- **Auth JWT**: register, login, me ✅
- **Servers CRUD**: create, list, get, update, delete, join, leave ✅
- **Channels CRUD**: create, list, get by id, update, delete (text + voice types) ✅
- **Messages CRUD**: list, create, delete ✅
- **WebSocket Gateway**: join_channel, send_message, new_message broadcast ✅
- **Voice WebSocket Events**: join_voice, leave_voice, voice_offer, voice_answer, voice_ice_candidate, voice_user_joined, voice_user_left ✅
- **Prisma + SQLite** rodando com migrações aplicadas ✅
- **Guards JWT** nas rotas protegidas ✅
- **Frontend**: Login/Register, Server list, Channel list, Message history, Real-time messages ✅
- **VoiceChannel Component**: WebRTC mesh P2P, microphone access, mute/deafen, participant list, ICE buffering, offer deduplication ✅
- **Validação global**: DTOs com class-validator para servers, channels, messages ✅
- **Testes**: 130 testes passando (unit + e2e + voice signaling)

## Arquivos alterados/criados (novos desde última atualização)
- `apps/api/prisma/schema.prisma` (SQLite para dev)
- `apps/api/.env` (DATABASE_URL para SQLite)
- `apps/api/src/prisma/prisma.service.ts`
- `apps/api/src/auth/` (service, controller, module, guard, strategy, DTOs)
- `apps/api/src/servers/` (service, controller, module atualizados com Prisma)
- `apps/api/src/channels/` (service, controller, module, DTOs - NOVO)
- `apps/api/src/messages/` (service, controller, module, DTOs - NOVO)
- `apps/api/src/gateway/` (ws.gateway.ts, gateway.module.ts - NOVO)
- `apps/api/src/app.module.ts` (atualizado com AuthModule, ChannelsModule, MessagesModule, GatewayModule)
- `apps/api/package.json` (dependências: @nestjs/jwt, @nestjs/passport, passport, passport-jwt, bcrypt, class-validator, reflect-metadata, @nestjs/websockets, @nestjs/platform-socket.io, socket.io)
- `apps/api/prisma/migrations/20261018173159_init/migration.sql`
- `apps/web/src/lib/api.ts` (cliente API tipado)
- `apps/web/src/context/AuthContext.tsx` (estado de autenticação)
- `apps/web/src/context/WebSocketContext.tsx` (conexão WebSocket + voice events, stale closure fix)
- `apps/web/src/components/LoginPage.tsx` (tela de login)
- `apps/web/src/components/RegisterPage.tsx` (tela de registro)
- `apps/web/src/components/AppLayout.tsx` (layout principal estilo Discord)
- `apps/web/src/components/VoiceChannel.tsx` (componente de voz WebRTC - ICE buffering, offer dedup, track mgmt)
- `apps/web/src/app/page.tsx` (página principal com providers)
- `apps/web/tsconfig.json` (path aliases @/*)
- `apps/web/next.config.mjs` (configuração Next.js)

## Testes executados e resultados
- [PASS] `POST /auth/register` - retorna user + token JWT
- [PASS] `POST /auth/login` - retorna user + token JWT
- [PASS] `GET /auth/me` - retorna user autenticado
- [PASS] `POST /servers` - cria servidor com owner
- [PASS] `GET /servers` - lista servidores do usuário
- [PASS] `GET /servers/:id` - retorna servidor com members e channels
- [PASS] `PUT /servers/:id` - atualiza nome (apenas owner)
- [PASS] `DELETE /servers/:id` - deleta servidor (cascata) - apenas owner
- [PASS] `POST /servers/:id/join` - entra no servidor
- [PASS] `POST /servers/:id/leave` - sai do servidor (403 se owner)
- [PASS] `POST /servers/:serverId/channels` - cria canal (text/voice)
- [PASS] `GET /servers/:serverId/channels` - lista canais do servidor
- [PASS] `GET /servers/:serverId/channels/:id` - retorna canal
- [PASS] `PUT /servers/:serverId/channels/:id` - atualiza canal (apenas owner)
- [PASS] `DELETE /servers/:serverId/channels/:id` - deleta canal (apenas owner)
- [PASS] `GET /channels/:channelId/messages` - lista mensagens
- [PASS] `POST /channels/:channelId/messages` - cria mensagem
- [PASS] `DELETE /channels/:channelId/messages/:id` - deleta mensagem (autor ou owner)
- [PASS] `WS /ws-chat` - conecta com token JWT, join_channel, send_message, new_message broadcast
- [PASS] `WS /ws-chat` - join_voice, leave_voice, voice_offer, voice_answer, voice_ice_candidate signaling
- [PASS] `WS /ws-chat` - voice_user_joined, voice_user_left, voice_joined, voice_left broadcasts
- [PASS] **Voice join_voice**: success, error on non-voice channel, error on non-member, error on duplicate join, auth required
- [PASS] **Voice leave_voice**: success, channel cleanup on last leave, auth required, not-in-channel handling
- [PASS] **Voice offer**: forward to target, error if sender not in channel, error if target not in channel, auth required
- [PASS] **Voice answer**: forward to target, error if sender not in channel
- [PASS] **Voice ICE candidate**: forward to target, silent drop if sender/target not in channel
- [PASS] **Voice disconnect cleanup**: removes participant, notifies others, deletes empty channel
- [PASS] Testes unitários: AuthService, ServersService, ChannelsService, MessagesService, WsGateway ✅
- [PASS] Testes e2e: Auth, Servers, Channels, Messages ✅
- [PASS] Frontend build TypeScript/Next.js ✅
- [PASS] PostgreSQL - não disponível localmente (usando SQLite para dev)

## Validação de voice channels (WebRTC)

### Fluxo de sinalização verificado
1. **join_voice** → servidor valida canal tipo 'voice' + membership → adiciona participante → `voice_joined` (com lista de participantes existentes) + broadcast `voice_user_joined`
2. **Novos participantes** → broadcast `voice_user_joined` para todos no canal → frontend cria `RTCPeerConnection` (initiator=true) → gera offer via `onnegotiationneeded`
3. **voice_offer** → servidor valida ambos no canal → encaminha para `targetUserId` → destinatário cria PC (initiator=false) → setRemoteDescription → createAnswer → setLocalDescription → `voice_answer`
4. **voice_answer** → servidor encaminha → originador setRemoteDescription
5. **voice_ice_candidate** → encaminha ICE candidates → destinatário adiciona via addIceCandidate (buffered se remoteDescription não pronta)
6. **leave_voice** / **disconnect** → remove participante → broadcast `voice_user_left` → limpeza de peer connections no frontend

### Condições de corrida tratadas
- **Ofertas duplicadas**: deduplicação via `pendingOffers` Set (chave = `userId:offerSDP`)
- **ICE antes da PC**: buffer `iceCandidateBuffer` no estado da peer connection, flush quando `hasLocalStream=true`
- **Entrada simultânea**: ambos criam offers (initiator=true), `onnegotiationneeded` gerencia
- **Recebimento de answer sem PC**: log warning, ignora graciosamente
- **Reconexão WebSocket**: `inVoiceChannelRef` evita stale closure no handler de `voice_left`

### Mute/Deafen verificado
- **Mute** (`track.enabled = false`): desativa transmissão local (`localStream` tracks + todos `RTCRtpSender` das peer connections)
- **Deafen** (`audioEl.muted = true`): silencia reprodução remota sem afetar transmissão
- **Cleanup ao sair**: `track.stop()` em todas as tracks, `pc.close()`, `audioEl.remove()`, limpeza de maps e buffers

### Permissões e segurança
- **getUserMedia**: requer permissão de microfone do navegador (HTTPS ou localhost)
- **Autorização no gateway**: todos eventos de voz verificam `isParticipantInChannel` para remetente e destinatário
- **Tokens**: JWT via query param no WebSocket, não expostos em logs (apenas userId/username)
- **CORS**: configurado no gateway para desenvolvimento

### Limitações conhecidas (não corrigidas nesta fase)
- **Mesh P2P limitado a ~6 participantes**: CPU/banda cresce O(n²); para >6, migrar para SFU (mediasoup)
- **STUN apenas**: Google STUN servers; TURN recomendado para NATs restritivos (não implementado)
- **Rastreamento em memória**: participantes perdidos no restart do servidor (sem persistência)
- **Sem renegociação automática**: mudanças de mídia (ex: troca de dispositivo) não disparam renegotiation
- **Áudio real não testado em dois clientes**: ambiente sem browser real para teste de ponta a ponta

### Roteiro de teste manual (para validar áudio real)
```bash
# 1. Iniciar API
cd apps/api && node dist/main

# 2. Iniciar Frontend (2 terminais/abas)
cd apps/web && npm run dev

# 3. Abrir http://localhost:3000 em DUAS abas/janelas diferentes (ou navegadores diferentes)
# 4. Registrar usuário A na aba 1, usuário B na aba 2
# 5. Usuário A cria servidor → cria canal tipo "Voz"
# 6. Usuário B entra no mesmo servidor
# 7. Ambos clicam no canal de voz → "Entrar no canal de voz"
# 8. Permitir acesso ao microfone em ambas abas
# 9. Verificar: contador "X pessoa(s)", botões Mute/Deafen, indicador verde "Conectado"
# 10. Falar em uma aba → ouvir na outra (teste de áudio real)
# 11. Testar Mute: ativar → outra pessoa para de ouvir
# 12. Testar Deafen: ativar → você para de ouvir, mas outra pessoa ainda te ouve
# 13. Sair em uma aba → outra aba mostra "1 pessoa(s)" e indicador de desconexão
```

## Problemas identificados e corrigidos
- Dependências mal configuradas nos pacotes originais → corrigido reinstalando
- Erros de decorators NestJS → resolvido com `experimentalDecorators` + `emitDecoratorMetadata`
- Falta de scripts npm em `package.json` → adicionados `dev`, `build`, `start`
- Erros de build por caminhos incorretos → corrigidos trabalhando dentro de cada app
- **Prisma relation error** (Server.owner) → corrigido adicionando `ownedServers` no User
- **Foreign key constraint** no delete de Server → corrigido com transaction cascata
- **TypeScript strict null checks** no ChannelsService → corrigido com checks de null
- **reflect-metadata** missing → instalado
- **bcrypt/passport-jwt types** missing → instalados @types
- **JwtService secret** missing no GatewayModule → corrigido importando JwtModule
- **WebSocket namespace connection** → corrigido usando URL correta `io('http://localhost:4000/ws-chat')`
- **API crashes em background** → executar em foreground ou com handlers de erro
- **Validação global** → adicionada com class-validator DTOs para servers, channels, messages
- **Testes paralelos** → executar em sequência (`--runInBand`) para evitar poluição de estado do banco
- **Validação em e2e** → adicionado ValidationPipe nas configurações de teste
- **RTCSessionDescriptionInit/RTCIceCandidateInit types** → definidos localmente no gateway (não existem em Node.js)
- **HTMLAudioElement.playsInline** → removido (propriedade só existe em HTMLVideoElement)
- **Race conditions WebRTC**: oferta duplicada, ICE antes da PC, answer sem PC → fixado com dedup + buffering
- **Stale closure WebSocketContext**: `inVoiceChannelRef` para acesso ao valor atual no handler `onmessage`
- **Track management**: `replaceTrack` para senders existentes, `addTrack` para novos, `track.stop()` no cleanup
- **Deafen implementation**: `audioEl.muted` no elemento de áudio remoto (não afeta captura)
- **Loop infinito WebSocketContext** (`Maximum update depth exceeded`): removida dependência circular `socket` → `cleanup` → `connect` → `useEffect` usando refs (`socketRef`, `isConnectingRef`, `tokenRef`) e `cleanup` sem dependências; guard `isConnectingRef` previne conexões simultâneas; reconexão só ocorre se `wasConnected=true`

## Bloqueios externos
- PostgreSQL não disponível localmente (docker indisponível) → usando SQLite para dev
- Vulnerabilidades de segurança no Next 14 e postcss (atualização para 16.4.2 é breaking change)
- WebRTC mesh P2P limitado a ~6 participantes (arquitetura SFU necessária para grupos maiores)
- Teste de áudio real entre dois clientes requer ambiente com dois browsers (não automatizável neste CI)

## Próximas tarefas concretas
1. Configurar PostgreSQL para produção (quando disponível)
2. Implementar SFU (mediasoup) para voice channels escaláveis (>6 users)
3. Implementar efeitos sonoros
4. Melhorar UI/UX (avatars, emojis, reactions, threads)
5. Adicionar suporte a TURN servers para NAT traversal robusto
6. Implementar screen sharing
7. Adicionar testes e2e de integração WebSocket com múltiplos clientes

## Comandos para retomar o desenvolvimento
```bash
# 1. Iniciar API (produção)
cd /home/tarockz/Documentos/Default\ Project/commet-clone/apps/api && node dist/main

# 2. Em outro terminal, iniciar Frontend
cd /home/tarockz/Documentos/Default\ Project/commet-clone/apps/web && npm run dev

# 3. Testar endpoints
TOKEN="<token_do_login>"
curl -X GET http://localhost:4000/servers -H "Authorization: Bearer $TOKEN"
curl -X POST http://localhost:4000/servers -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"name":"Meu Servidor"}'

# 4. Executar testes
cd /home/tarockz/Documentos/Default\ Project/commet-clone/apps/api && npx jest --runInBand
```

## Testar WebSocket
```bash
# Conectar via socket.io-client
# URL: http://localhost:4000/ws-chat
# Query param: token=<JWT_TOKEN>
# Eventos text: join_channel, send_message, new_message
# Eventos voice: join_voice, leave_voice, voice_offer, voice_answer, voice_ice_candidate
# Broadcasts voice: voice_user_joined, voice_user_left, voice_joined, voice_left
```

## Arquitetura Voice (WebRTC Mesh P2P)
- **STUN**: Google STUN servers (stun.l.google.com:19302)
- **Signaling**: Via WebSocket namespace `/ws-chat` no servidor NestJS
- **Topologia**: Mesh P2P (cada par conecta diretamente com todos os outros)
- **Limitação**: Funciona bem até ~6 participantes; para mais, migrar para SFU (mediasoup)
- **Rastreamento de participantes**: Em memória no gateway (`Map<channelId, Map<socketId, VoiceParticipant>>`)
- **Limpeza automática**: No disconnect do socket, remove participante e notifica outros
- **Codecs**: Opus (padrão WebRTC), 48kHz stereo
- **Race condition handling**: Offer deduplication, ICE candidate buffering, answer validation
- **Resource cleanup**: Tracks, peer connections, audio elements, buffers, event listeners