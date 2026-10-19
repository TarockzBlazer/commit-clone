import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';

describe('MessagesController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let serverId: string;
  let channelId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }));
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.message.deleteMany({});
    await prisma.channelMember.deleteMany({});
    await prisma.channel.deleteMany({});
    await prisma.serverMember.deleteMany({});
    await prisma.server.deleteMany({});
    await prisma.user.deleteMany({});

    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ username: 'messagetest', email: 'message@test.com', password: 'password123' });
    token = res.body.token;

    const serverRes = await request(app.getHttpServer())
      .post('/servers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Message Test Server' });
    serverId = serverRes.body.id;

    const channelRes = await request(app.getHttpServer())
      .post(`/servers/${serverId}/channels`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'general', type: 'text' });
    channelId = channelRes.body.id;
  });

  describe('/channels/:channelId/messages (GET)', () => {
    it('should list messages (empty initially)', () => {
      return request(app.getHttpServer())
        .get(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
          expect(res.body.length).toBe(0);
        });
    });

    it('should reject non-member', async () => {
      const otherRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ username: 'outsider3', email: 'outsider3@test.com', password: 'password123' });
      const otherToken = otherRes.body.token;

      return request(app.getHttpServer())
        .get(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(403);
    });
  });

  describe('/channels/:channelId/messages (POST)', () => {
    it('should create a message', () => {
      return request(app.getHttpServer())
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({ channelId, content: 'Hello world!' })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');
          expect(res.body.content).toBe('Hello world!');
          expect(res.body.userId).toBeDefined();
          expect(res.body.channelId).toBe(channelId);
          expect(res.body).toHaveProperty('user');
          expect(res.body.user).toHaveProperty('username');
        });
    });

    it('should reject empty content', () => {
      return request(app.getHttpServer())
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({ channelId, content: '' })
        .expect(400);
    });

    it('should reject content too long', () => {
      const longContent = 'a'.repeat(2001);
      return request(app.getHttpServer())
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({ channelId, content: longContent })
        .expect(400);
    });

    it('should reject non-member', async () => {
      const otherRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ username: 'outsider4', email: 'outsider4@test.com', password: 'password123' });
      const otherToken = otherRes.body.token;

      return request(app.getHttpServer())
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ channelId, content: 'Hack attempt' })
        .expect(403);
    });
  });

  describe('/channels/:channelId/messages/:id (DELETE)', () => {
    let messageId: string;

    beforeEach(async () => {
      const res = await request(app.getHttpServer())
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({ channelId, content: 'Message to delete' });
      messageId = res.body.id;
    });

    it('should delete own message', () => {
      return request(app.getHttpServer())
        .delete(`/channels/${channelId}/messages/${messageId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });

    it('should reject non-author non-owner', async () => {
      const otherRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ username: 'othermsg', email: 'othermsg@test.com', password: 'password123' });
      const otherToken = otherRes.body.token;

      const msgRes = await request(app.getHttpServer())
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({ channelId, content: 'Other user message' });
      const otherMessageId = msgRes.body.id;

      return request(app.getHttpServer())
        .delete(`/channels/${channelId}/messages/${otherMessageId}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(403);
    });

    it('should allow owner to delete other user message', async () => {
      const otherRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ username: 'othermsg2', email: 'othermsg2@test.com', password: 'password123' });
      const otherToken = otherRes.body.token;

      // Other user joins the server first
      await request(app.getHttpServer())
        .post(`/servers/${serverId}/join`)
        .set('Authorization', `Bearer ${otherToken}`);

      const msgRes = await request(app.getHttpServer())
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ channelId, content: 'Owner can delete this' });
      const otherMessageId = msgRes.body.id;

      return request(app.getHttpServer())
        .delete(`/channels/${channelId}/messages/${otherMessageId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });

    it('should return 404 for non-existent message', () => {
      return request(app.getHttpServer())
        .delete(`/channels/${channelId}/messages/non-existent`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });
});