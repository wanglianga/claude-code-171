import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class JwtGuard implements CanActivate {
  constructor(private jwt: JwtService) {}
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) throw new UnauthorizedException('缺少登录令牌');
    try {
      req.user = this.jwt.verify(token, { secret: process.env.JWT_SECRET || 'dev-secret' });
    } catch {
      throw new UnauthorizedException('登录已过期，请重新登录');
    }
    return true;
  }
}
