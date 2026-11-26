import { MembershipRole } from '@prisma/client';
import { IsEmail, IsEnum } from 'class-validator';

export class InviteMemberDto {
  @IsEmail({}, { message: 'email debe ser un correo válido y registrado en la API.' })
  email!: string;

  @IsEnum(MembershipRole, { message: 'role debe ser LECTOR, EDITOR o ADMINISTRADOR.' })
  role!: MembershipRole;
}

export class UpdateMemberDto {
  @IsEnum(MembershipRole, { message: 'role debe ser LECTOR, EDITOR o ADMINISTRADOR.' })
  role!: MembershipRole;
}
