import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
async function bootstrap(){
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: 'http://localhost:3000',
    credentials: true,
  });
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: false,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  }));
  await app.listen(4000);
}
bootstrap();
