import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Patch,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SpaceAccessService } from '../access/space-access.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user';
import { FilesService } from '../files/files.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly files: FilesService,
    private readonly access: SpaceAccessService,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Consultar perfil propio' })
  async getProfile(@CurrentUser() user: AuthUser) {
    return { data: await this.users.getProfile(user.id) };
  }

  @Patch('me')
  @ApiOperation({ summary: 'Editar perfil propio' })
  async updateProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return { data: await this.users.updateProfile(user.id, dto) };
  }

  @Post('me/avatar')
  @HttpCode(201)
  @UseInterceptors(FileInterceptor('avatar'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { avatar: { type: 'string', format: 'binary' } },
      required: ['avatar'],
    },
  })
  @ApiOperation({ summary: 'Subir/reemplazar avatar (campo `avatar`); el objeto anterior se elimina' })
  async uploadAvatar(@CurrentUser() user: AuthUser, @UploadedFile() avatar: Express.Multer.File) {
    const { space } = await this.access.require(user, 'write');
    const uploaded = await this.files.upload(user, space, avatar, 'AVATAR', 'USER', user.id);
    return { data: await this.users.setAvatar(user.id, uploaded) };
  }

  @Put('me/password')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cambiar contraseña (revoca las demás sesiones)' })
  async changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    return { data: await this.users.changePassword(user.id, dto) };
  }

  @Delete('me')
  @HttpCode(204)
  @ApiOperation({ summary: 'Eliminar la cuenta y todos sus datos (cascada)' })
  async deleteAccount(@CurrentUser() user: AuthUser, @Body() dto: DeleteAccountDto) {
    await this.users.deleteAccount(user.id, dto);
  }
}
