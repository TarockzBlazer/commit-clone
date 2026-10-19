import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';

describe('AuthController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

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
  });

  describe('/auth/register (POST)', () => {
    it('should register a new user', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({
          username: 'e2etest',
          email: 'e2e@test.com',
          password: 'password123',
        })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('user');
          expect(res.body.user).toHaveProperty('id');
          expect(res.body.user.username).toBe('e2etest');
          expect(res.body.user.email).toBe('e2e@test.com');
          expect(res.body).toHaveProperty('token');
          expect(typeof res.body.token).toBe('string');
        });
    });

    it('should reject duplicate username', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({
          username: 'duplicate',
          email: 'first@test.com',
          password: 'password123',
        })
        .expect(201)
        .then(() => {
          return request(app.getHttpServer())
            .post('/auth/register')
            .send({
              username: 'duplicate',
              email: 'second@test.com',
              password: 'password123',
            })
            .expect(409);
        });
    });

    it('should reject duplicate email', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({
          username: 'firstuser',
          email: 'same@test.com',
          password: 'password123',
        })
        .expect(201)
        .then(() => {
          return request(app.getHttpServer())
            .post('/auth/register')
            .send({
              username: 'seconduser',
              email: 'same@test.com',
              password: 'password123',
            })
            .expect(409);
        });
    });

    it('should reject short username', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({
          username: 'ab',
          email: 'test@test.com',
          password: 'password123',
        })
        .expect(400);
    });

    it('should reject short password', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({
          username: 'testuser',
          email: 'test@test.com',
          password: 'short',
        })
        .expect(400);
    });
  });

  describe('/auth/login (POST)', () => {
    beforeEach(async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          username: 'logintest',
          email: 'login@test.com',
          password: 'password123',
        });
    });

    it('should login with valid credentials', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({
          username: 'logintest',
          password: 'password123',
        })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('user');
          expect(res.body.user.username).toBe('logintest');
          expect(res.body).toHaveProperty('token');
        });
    });

    it('should reject invalid password', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({
          username: 'logintest',
          password: 'wrongpassword',
        })
        .expect(401);
    });

    it('should reject non-existent user', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({
          username: 'nonexistent',
          password: 'password123',
        })
        .expect(401);
    });
  });

  describe('/auth/me (GET)', () => {
    let token: string;

    beforeEach(async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          username: 'metest',
          email: 'me@test.com',
          password: 'password123',
        });
      token = res.body.token;
    });

    it('should return user data with valid token', () => {
      return request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');
          expect(res.body.username).toBe('metest');
          expect(res.body.email).toBe('me@test.com');
        });
    });

    it('should reject without token', () => {
      return request(app.getHttpServer())
        .get('/auth/me')
        .expect(401);
    });

    it('should reject invalid token', () => {
      return request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });
  });
});