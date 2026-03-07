import { updateUserSchema } from '@aijourney/shared';
import { Body, Controller, Get, Inject, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { UsersService } from './users.service';

@ApiTags('users')
@Controller('users')
@ApiBearerAuth()
export class UsersController {
  constructor(@Inject(UsersService) private readonly usersService: UsersService) {}

  @Get()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'List all users (admin)' })
  async list() {
    const users = await this.usersService.listAll();
    return { data: users };
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Get user by ID' })
  async getOne(@Param('id') id: string) {
    const user = await this.usersService.getById(id);
    return { data: user };
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Update user profile' })
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateUserSchema)) body: unknown,
  ) {
    const user = await this.usersService.update(id, body as Record<string, unknown>);
    return { data: user };
  }

  @Post(':id/promote')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Promote user to admin (admin only)' })
  @ApiBody({ schema: { type: 'object', properties: {} } })
  async promote(@Param('id') id: string) {
    const user = await this.usersService.update(id, { role: 'admin' as const });
    return { data: user };
  }

  @Post(':id/revoke')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Revoke admin rights (admin only)' })
  @ApiBody({ schema: { type: 'object', properties: {} } })
  async revoke(@Param('id') id: string) {
    const user = await this.usersService.update(id, { role: 'employee' as const });
    return { data: user };
  }
}
