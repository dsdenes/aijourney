import { forwardRef, Module } from "@nestjs/common";
import { PassportModule } from "@nestjs/passport";
import { UsersModule } from "../users/users.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtStrategy } from "./jwt.strategy";
import { RolesGuard } from "./roles.guard";

@Module({
	imports: [
		PassportModule.register({ defaultStrategy: "jwt" }),
		forwardRef(() => UsersModule),
	],
	controllers: [AuthController],
	providers: [AuthService, JwtStrategy, RolesGuard],
	exports: [AuthService, RolesGuard],
})
export class AuthModule {}
