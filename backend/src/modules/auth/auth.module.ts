import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { Body, Controller, Get, Post, UnauthorizedException } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { IsNotEmpty } from 'class-validator';
import { User } from '../../entities/user.entity';
import { Farmer } from '../../entities/farmer.entity';
import { Public } from '../../common/decorators';
import { ReqUser } from '../../common/req-user.decorator';

class LoginDto {
  @IsNotEmpty() username: string;
  @IsNotEmpty() password: string;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private users: Repository<User>,
    @InjectRepository(Farmer) private farmers: Repository<Farmer>,
    private jwt: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.users.findOne({ where: { username: dto.username } });
    if (!user || !bcrypt.compareSync(dto.password, user.password)) {
      throw new UnauthorizedException('用户名或密码错误');
    }
    let farmerId: number | null = null;
    if (user.role === 'farmer') {
      const f = await this.farmers.findOne({ where: { userId: user.id } });
      farmerId = f ? f.id : null;
    }
    const payload = {
      sub: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      farmerId,
    };
    return { token: await this.jwt.signAsync(payload), user: payload };
  }
}

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Get('profile')
  profile(@ReqUser() user: any) {
    return user;
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([User, Farmer])],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
