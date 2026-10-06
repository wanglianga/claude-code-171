import { Body, Controller, Post, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { User } from '../entities';

@Controller('auth')
export class AuthController {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    private jwt: JwtService,
  ) {}

  @Post('login')
  async login(@Body() body: { username: string; password: string }) {
    const user = await this.userRepo.findOne({ where: { username: body?.username } });
    if (!user || user.password !== body?.password) {
      throw new UnauthorizedException('用户名或密码错误');
    }
    const token = await this.jwt.signAsync(
      { sub: user.id, username: user.username, name: user.name, role: user.role, farmerId: user.farmerId },
    );
    return {
      token,
      user: { id: user.id, username: user.username, name: user.name, role: user.role, farmerId: user.farmerId },
    };
  }
}
