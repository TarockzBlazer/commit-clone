import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto, LoginDto } from './dto/auth.dto';

jest.mock('bcrypt');
jest.mock('@nestjs/jwt');

describe('AuthService', () => {
  let service: AuthService;
  let prisma: any;
  let jwtService: any;

  const mockUser = {
    id: 'user-1',
    username: 'testuser',
    email: 'test@example.com',
    password: 'hashed-password',
    createdAt: new Date(),
  };

  beforeEach(async () => {
    const mockPrisma = {
      user: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
      },
    };

    const mockJwtService = {
      sign: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get(PrismaService);
    jwtService = module.get(JwtService);

    jest.clearAllMocks();
  });

  describe('register', () => {
    const registerDto = {
      username: 'testuser',
      email: 'test@example.com',
      password: 'password123',
    };

    it('should register a new user successfully', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
      prisma.user.create.mockResolvedValue({
        id: 'user-1',
        username: 'testuser',
        email: 'test@example.com',
        createdAt: new Date(),
      });
      jwtService.sign.mockReturnValue('mock-token');

      const result = await service.register(registerDto);

      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { OR: [{ username: 'testuser' }, { email: 'test@example.com' }] },
      });
      expect(bcrypt.hash).toHaveBeenCalledWith('password123', 10);
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          username: 'testuser',
          email: 'test@example.com',
          password: 'hashed-password',
        },
        select: { id: true, username: true, email: true, createdAt: true },
      });
      expect(jwtService.sign).toHaveBeenCalledWith({ sub: 'user-1', username: 'testuser' });
      expect(result).toEqual({
        user: {
          id: 'user-1',
          username: 'testuser',
          email: 'test@example.com',
          createdAt: expect.any(Date),
        },
        token: 'mock-token',
      });
    });

    it('should throw ConflictException if username exists', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'user-1', username: 'testuser' });

      await expect(service.register({ username: 'testuser', email: 'test@example.com', password: 'password123' })).rejects.toThrow(ConflictException);
      expect(prisma.user.findFirst).toHaveBeenCalled();
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('should throw ConflictException if email exists', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'user-1', email: 'test@example.com' });

      await expect(service.register({ username: 'testuser', email: 'test@example.com', password: 'password123' })).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    const mockUser = {
      id: 'user-1',
      username: 'testuser',
      email: 'test@example.com',
      password: 'hashed-password',
    };

    it('should login successfully with valid credentials', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...mockUser });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      jwtService.sign.mockReturnValue('mock-token');

      const result = await service.login({ username: 'testuser', password: 'password123' });

      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { username: 'testuser' } });
      expect(bcrypt.compare).toHaveBeenCalledWith('password123', 'hashed-password');
      expect(jwtService.sign).toHaveBeenCalledWith({ sub: 'user-1', username: 'testuser' });
      expect(result).toEqual({
        user: { id: 'user-1', username: 'testuser', email: 'test@example.com' },
        token: 'mock-token',
      });
    });

    it('should throw UnauthorizedException if user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.login({ username: 'testuser', password: 'password123' })).rejects.toThrow('Invalid credentials');
    });

    it('should throw UnauthorizedException if password is invalid', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login({ username: 'testuser', password: 'password123' })).rejects.toThrow('Invalid credentials');
    });
  });

  describe('me', () => {
    it('should return user data', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        username: 'testuser',
        email: 'test@example.com',
        createdAt: new Date(),
      });

      const result = await service.me('user-1');

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        select: { id: true, username: true, email: true, createdAt: true },
      });
      expect(result).toEqual({
        id: 'user-1',
        username: 'testuser',
        email: 'test@example.com',
        createdAt: expect.any(Date),
      });
    });

    it('should throw UnauthorizedException if user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.me('user-1')).rejects.toThrow('User not found');
    });
  });
});