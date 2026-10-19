import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';

describe('ChannelsController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let serverId: string;

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
      .send({ username: 'channeltest', email: 'channel@test.com', password: 'password123' });
    token = res.body.token;

    const serverRes = await request(app.getHttpServer())
      .post('/servers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Channel Test Server' });
    serverId = serverRes.body.id;
  });

  describe('/servers/:serverId/channels (POST)', () => {
    it('should create a text channel', () => {
      return request(app.getHttpServer())
        .post(`/servers/${serverId}/channels`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'general', type: 'text' })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');
          expect(res.body.name).toBe('general');
          expect(res.body.type).toBe('text');
          expect(res.body.serverId).toBe(serverId);
        });
    });

    it('should create a voice channel', () => {
      return request(app.getHttpServer())
        .post(`/servers/${serverId}/channels`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'voice-chat', type: 'voice' })
        .expect(201)
        .expect((res) => {
          expect(res.body.type).toBe('voice');
        });
    });

    it('should reject invalid type', () => {
      return request(app.getHttpServer())
        .post(`/servers/${serverId}/channels`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'test', type: 'invalid' })
        .expect(400);
    });

    it('should reject empty name', () => {
      return request(app.getHttpServer())
        .post(`/servers/${serverId}/channels`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '', type: 'text' })
        .expect(400);
    });

    it('should reject non-member', async () => {
      const otherRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ username: 'outsider', email: 'outsider@test.com', password: 'password123' });
      const otherToken = otherRes.body.token;

      return request(app.getHttpServer())
        .post(`/servers/${serverId}/channels`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ name: 'test', type: 'text' })
        .expect(403);
    });
  });

  describe('/servers/:serverId/channels (GET)', () => {
    beforeEach(async () => {
      await request(app.getHttpServer())
        .post(`/servers/${serverId}/channels`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'general', type: 'text' });

      await request(app.getHttpServer())
        .post(`/servers/${serverId}/channels`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'random', type: 'text' });
    });

    it('should list channels', () => {
      return request(app.getHttpServer())
        .get(`/servers/${serverId}/channels`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
          expect(res.body.length).toBeGreaterThanOrEqual(2);
          expect(res.body[0]).toHaveProperty('name');
          expect(res.body[0]).toHaveProperty('type');
        });
    });

    it('should reject non-member', async () => {
      const otherRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ username: 'outsider2', email: 'outsider2@test.com', password: 'password123' });
      const otherToken = otherRes.body.token;

      return request(app.getHttpServer())
        .get(`/servers/${serverId}/channels`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(403);
    });
  });

  describe('/servers/:serverId/channels/:id (GET)', () => {
    let channelId: string;

    beforeEach(async () => {
      const res = await request(app.getHttpServer())
        .post(`/servers/${serverId}/channels`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'specific', type: 'text' });
      channelId = res.body.id;
    });

    it('should get channel by id', () => {
      return request(app.getHttpServer())
        .get(`/servers/${serverId}/channels/${channelId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.id).toBe(channelId);
          expect(res.body.name).toBe('specific');
        });
    });

    it('should return 404 for non-existent channel', () => {
      return request(app.getHttpServer())
        .get(`/servers/${serverId}/channels/non-existent`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });

  describe('/servers/:serverId/channels/:id (PUT)', () => {
    let channelId: string;

    beforeEach(async () => {
      const res = await request(app.getHttpServer())
        .post(`/servers/${serverId}/channels`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'original', type: 'text' });
      channelId = res.body.id;
    });

    it('should update channel name', () => {
      return request(app.getHttpServer())
        .put(`/servers/${serverId}/channels/${channelId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'updated-name' })
        .expect(200)
        .expect((res) => {
          expect(res.body.name).toBe('updated-name');
        });
    });

    it('should reject empty name', () => {
      return request(app.getHttpServer())
        .put(`/servers/${serverId}/channels/${channelId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '' })
        .expect(400);
    });

    it('should reject non-owner', async () => {
      const otherRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ username: 'otherchan', email: 'otherchan@test.com', password: 'password123' });
      const otherToken = otherRes.body.token;

      return request(app.getHttpServer())
        .put(`/servers/${serverId}/channels/${channelId}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ name: 'hacked' })
        .expect(403);
    });
  });

  describe('/servers/:serverId/channels/:id (DELETE)', () => {
    let channelId: string;

    beforeEach(async () => {
      const res = await request(app.getHttpServer())
        .post(`/servers/${serverId}/channels`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'to-delete', type: 'text' });
      channelId = res.body.id;
    });

    it('should delete channel', () => {
      return request(app.getHttpServer())
        .delete(`/servers/${serverId}/channels/${channelId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });

    it('should reject non-owner', async () => {
      const otherRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ username: 'otherchan2', email: 'otherchan2@test.com', password: 'password123' });
      const otherToken = otherRes.body.token;

      const createRes = await request(app.getHttpServer())
        .post(`/servers/${serverId}/channels`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'to-delete-2', type: 'text' });
      const channelId2 = createRes.body.id;

      return request(app.getHttpServer())
        .delete(`/servers/${serverId}/channels/${channelId2}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(403);
    });
  });
});