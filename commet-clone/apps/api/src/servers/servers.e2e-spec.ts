import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';

describe('ServersController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let userId: string;

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
      .send({ username: 'servertest', email: 'server@test.com', password: 'password123' });
    token = res.body.token;
  });

  describe('/servers (POST)', () => {
    it('should create a server', () => {
      return request(app.getHttpServer())
        .post('/servers')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'My Server' })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');
          expect(res.body.name).toBe('My Server');
          expect(res.body.ownerId).toBeDefined();
          expect(res.body.members).toHaveLength(1);
          expect(res.body.members[0].role).toBe('owner');
        });
    });

    it('should reject empty name', () => {
      return request(app.getHttpServer())
        .post('/servers')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '' })
        .expect(400);
    });

    it('should reject without auth', () => {
      return request(app.getHttpServer())
        .post('/servers')
        .send({ name: 'Test' })
        .expect(401);
    });
  });

  describe('/servers (GET)', () => {
    beforeEach(async () => {
      await request(app.getHttpServer())
        .post('/servers')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Server 1' });
    });

    it('should list user servers', () => {
      return request(app.getHttpServer())
        .get('/servers')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
          expect(res.body.length).toBeGreaterThan(0);
          expect(res.body[0]).toHaveProperty('name');
          expect(res.body[0]).toHaveProperty('owner');
          expect(res.body[0]).toHaveProperty('channels');
        });
    });
  });

  describe('/servers/:id (GET)', () => {
    let serverId: string;

    beforeEach(async () => {
      const res = await request(app.getHttpServer())
        .post('/servers')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Test Server' });
      serverId = res.body.id;
    });

    it('should get server by id', () => {
      return request(app.getHttpServer())
        .get(`/servers/${serverId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.id).toBe(serverId);
          expect(res.body.name).toBe('Test Server');
          expect(res.body).toHaveProperty('owner');
          expect(res.body).toHaveProperty('members');
        });
    });

    it('should return 404 for non-existent server', () => {
      return request(app.getHttpServer())
        .get('/servers/non-existent-id')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });

  describe('/servers/:id (PUT)', () => {
    let serverId: string;

    beforeEach(async () => {
      const res = await request(app.getHttpServer())
        .post('/servers')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Original Name' });
      serverId = res.body.id;
    });

    it('should update server name', () => {
      return request(app.getHttpServer())
        .put(`/servers/${serverId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Updated Name' })
        .expect(200)
        .expect((res) => {
          expect(res.body.name).toBe('Updated Name');
        });
    });

    it('should reject empty name', () => {
      return request(app.getHttpServer())
        .put(`/servers/${serverId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '' })
        .expect(400);
    });

    it('should reject non-member', async () => {
      const otherRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ username: 'otheruser', email: 'other@test.com', password: 'password123' });
      const otherToken = otherRes.body.token;

      return request(app.getHttpServer())
        .put(`/servers/${serverId}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ name: 'Hacked Name' })
        .expect(403); // Not a member, so forbidden
    });
  });

  describe('/servers/:id (DELETE)', () => {
    let serverId: string;

    beforeEach(async () => {
      const res = await request(app.getHttpServer())
        .post('/servers')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Server to Delete' });
      serverId = res.body.id;
    });

    it('should delete server', () => {
      return request(app.getHttpServer())
        .delete(`/servers/${serverId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.message).toBe('Server deleted successfully');
        });
    });

    it('should reject non-member', async () => {
      const otherRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ username: 'otheruser2', email: 'other2@test.com', password: 'password123' });
      const otherToken = otherRes.body.token;

      const res = await request(app.getHttpServer())
        .post('/servers')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Server to Delete 2' });
      const serverId2 = res.body.id;

      return request(app.getHttpServer())
        .delete(`/servers/${serverId2}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(403); // Non-member gets 403 (forbidden)
    });
  });

  describe('/servers/:id/join (POST) — removed', () => {
    let serverId: string;

    beforeEach(async () => {
      const res = await request(app.getHttpServer())
        .post('/servers')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'No Direct Join Server' });
      serverId = res.body.id;
    });

    it('should not allow joining a server without an invite', () => {
      return request(app.getHttpServer())
        .post(`/servers/${serverId}/join`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });

  describe('/servers/:id/leave (POST)', () => {
    let serverId: string;

    beforeEach(async () => {
      const res = await request(app.getHttpServer())
        .post('/servers')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Leavable Server' });
      serverId = res.body.id;
    });

    it('should leave server', async () => {
      const otherRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ username: 'leaver', email: 'leaver@test.com', password: 'password123' });
      const otherToken = otherRes.body.token;

      const inviteRes = await request(app.getHttpServer())
        .post(`/servers/${serverId}/invites`)
        .set('Authorization', `Bearer ${token}`)
        .send({ maxUses: 1 })
        .expect(201);

      await request(app.getHttpServer())
        .post('/invites/accept')
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ code: inviteRes.body.code })
        .expect(201);

      return request(app.getHttpServer())
        .post(`/servers/${serverId}/leave`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(201);
    });

    it('should reject owner leaving', () => {
      return request(app.getHttpServer())
        .post(`/servers/${serverId}/leave`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });
  });

  describe('/invites/:code (GET) — public preview', () => {
    it('should not expose the internal server id', async () => {
      const serverRes = await request(app.getHttpServer())
        .post('/servers')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Invite Preview Server' })
        .expect(201);

      const inviteRes = await request(app.getHttpServer())
        .post(`/servers/${serverRes.body.id}/invites`)
        .set('Authorization', `Bearer ${token}`)
        .send({ maxUses: 1 })
        .expect(201);

      const preview = await request(app.getHttpServer())
        .get(`/invites/${inviteRes.body.code}`)
        .expect(200);

      expect(preview.body.serverId).toBeUndefined();
      expect(preview.body.serverName).toBe('Invite Preview Server');
    });
  });
});